import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { checkDomainsBatch, warmupBootstrap } from './checker.js';
import { generateDomains } from './generator.js';
import { formatPrice, isAffordable } from './pricing.js';
import {
  loadResults,
  saveResults,
  saveStatus,
  wasChecked,
  markChecked,
  addResult,
  getStats,
  printBanner,
  printAvailable,
  printTaken,
  printError,
  printSkippedPremium,
  printBatchProgress,
  printStats,
  printSaving,
  printSaved,
} from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadConfig() {
  const raw = await readFile(join(__dirname, '..', 'config.json'), 'utf8');
  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCliArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

async function main() {
  printBanner();

  const config = await loadConfig();
  const maxRuntime = (() => {
    const v = parseCliArg('--max-runtime');
    return v ? parseInt(v, 10) : null;
  })();

  // CLI overrides for TLD/strategy filtering (used by matrix jobs)
  const tldFilter = parseCliArg('--tlds');
  if (tldFilter) {
    config.tlds = tldFilter.split(',').map(t => t.startsWith('.') ? t : '.' + t);
  }
  const stratFilter = parseCliArg('--strategies');
  if (stratFilter) {
    config.strategies = stratFilter.split(',');
  }

  const batchSize = config.batchSize || 50;
  const concurrentBatches = config.concurrentBatches || 3;
  const domainsPerRound = batchSize * concurrentBatches;

  console.log(`  Config: ${config.tlds.join(', ')}`);
  console.log(`  Max price: $${config.maxPricePerYear}/yr`);
  console.log(`  Keywords: ${config.keywords.join(', ')}`);
  console.log(`  Names: ${config.personalNames.join(', ')}`);
  console.log(`  Strategies: ${config.strategies.join(', ')}`);
  console.log(`  Throughput: ${concurrentBatches} x ${batchSize} = ${domainsPerRound} domains/round`);
  if (maxRuntime) console.log(`  Max runtime: ${Math.round(maxRuntime / 1000)}s`);
  console.log();

  // Load previous results
  await loadResults();
  const stats = getStats();
  if (stats.checked > 0) {
    console.log(`  Resuming: ${stats.checked} already checked, ${stats.found} found so far\n`);
  }

  // Warm up RDAP bootstrap
  process.stdout.write('  Loading RDAP bootstrap...');
  await warmupBootstrap();
  console.log(' done!\n');

  const startedAt = new Date();

  // Write initial status
  await saveStatus({
    running: true,
    startedAt: startedAt.toISOString(),
    domainsChecked: stats.checked,
    domainsFound: stats.found,
  });

  // Auto-save interval
  let saveCounter = 0;
  const SAVE_EVERY = 200;

  // Handle Ctrl+C / max-runtime gracefully
  let stopping = false;

  async function gracefulStop() {
    if (stopping) process.exit(1);
    stopping = true;
    printSaving();
    await saveResults();
    const s = getStats();
    printSaved(s.found);
    printStats(s.checked, s.found);
    const runDuration = Math.round((Date.now() - startedAt.getTime()) / 1000);
    await saveStatus({
      running: false,
      startedAt: startedAt.toISOString(),
      lastCompleted: new Date().toISOString(),
      domainsChecked: s.checked,
      domainsFound: s.found,
      runDuration,
    });
    process.exit(0);
  }

  process.on('SIGINT', gracefulStop);

  // Max-runtime timer
  if (maxRuntime) {
    setTimeout(() => {
      console.log(`\n  Max runtime (${Math.round(maxRuntime / 1000)}s) reached, stopping...`);
      gracefulStop();
    }, maxRuntime);
  }

  // Main loop — concurrent batches
  const generator = generateDomains(config);
  let roundNum = 0;

  while (!stopping) {
    // Collect domains for all concurrent batches
    const allDomains = []; // { domain, strategy, tld }
    while (allDomains.length < domainsPerRound) {
      const next = await generator.next();
      if (next.done) break;

      const { domain, strategy } = next.value;
      if (wasChecked(domain)) continue;

      const tld = '.' + domain.split('.').pop();
      if (!isAffordable(tld, config.maxPricePerYear)) continue;

      allDomains.push({ domain, strategy, tld });
    }

    if (allDomains.length === 0) break;

    roundNum++;
    printBatchProgress(roundNum, allDomains.length);

    // Split into concurrent batches
    const batches = [];
    for (let i = 0; i < allDomains.length; i += batchSize) {
      batches.push(allDomains.slice(i, i + batchSize));
    }

    // Rate limit — one delay per round
    await sleep(config.requestDelayMs);

    // Fire all batches concurrently
    const batchResults = await Promise.allSettled(
      batches.map(batch => checkDomainsBatch(batch.map(b => b.domain)))
    );

    // Merge all results into one map
    const results = new Map();
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        for (const [domain, result] of r.value) {
          results.set(domain, result);
        }
      }
    }

    // Process results
    for (const { domain, strategy, tld } of allDomains) {
      if (stopping) break;

      const result = results.get(domain);
      if (!result) continue;

      markChecked(domain);

      if (result.available === true) {
        // Premium price filtering
        if (result.premium && result.eppPriceAmount != null) {
          const premiumPrice = parseFloat(result.eppPriceAmount);
          if (premiumPrice > config.maxPricePerYear) {
            printSkippedPremium(domain, result.eppPrice);
            continue;
          }
        }

        const price = result.eppPrice ?? formatPrice(tld);
        const premium = result.premium ? ' [PREMIUM]' : '';
        printAvailable(domain, strategy, price + premium);
        addResult({
          domain,
          strategy,
          price,
          tld,
          premium: result.premium ?? false,
          checkedAt: new Date().toISOString(),
        });
      } else if (result.available === false) {
        printTaken(domain);
      } else {
        printError(domain, result.reason ?? 'unknown');
      }
    }

    // Save found domains immediately if any new ones
    const currentStats = getStats();
    if (currentStats.found > stats.found) {
      await saveResults();
    }

    // Auto-save checked list periodically
    saveCounter += allDomains.length;
    if (saveCounter >= SAVE_EVERY) {
      await saveResults();
      saveCounter = 0;
    }
  }

  // Final save
  printSaving();
  await saveResults();
  const finalStats = getStats();
  printSaved(finalStats.found);
  printStats(finalStats.checked, finalStats.found);

  const runDuration = Math.round((Date.now() - startedAt.getTime()) / 1000);
  await saveStatus({
    running: false,
    startedAt: startedAt.toISOString(),
    lastCompleted: new Date().toISOString(),
    domainsChecked: finalStats.checked,
    domainsFound: finalStats.found,
    runDuration,
  });

  console.log('  All domain combinations exhausted. Edit config.json to add more!\n');
}

main().catch(err => {
  console.error('\n  Fatal error:', err.message);
  process.exit(1);
});
