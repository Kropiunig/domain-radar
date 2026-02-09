import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { checkDomain, checkDomainsBatch, warmupBootstrap } from './checker.js';
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

function parseMaxRuntime() {
  const idx = process.argv.indexOf('--max-runtime');
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  const ms = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function parsePremiumPrice(eppPrice) {
  if (!eppPrice) return null;
  const match = eppPrice.match(/\$(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

async function main() {
  printBanner();

  const config = await loadConfig();
  const maxRuntime = parseMaxRuntime();

  console.log(`  Config: ${config.tlds.join(', ')}`);
  console.log(`  Max price: $${config.maxPricePerYear}/yr`);
  console.log(`  Keywords: ${config.keywords.join(', ')}`);
  console.log(`  Names: ${config.personalNames.join(', ')}`);
  console.log(`  Strategies: ${config.strategies.join(', ')}`);
  console.log(`  Batch size: ${config.batchSize}`);
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
  const SAVE_EVERY = 50;

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

  // Main loop — batched
  const generator = generateDomains(config);
  const batchSize = config.batchSize || 10;
  let batchNum = 0;

  while (!stopping) {
    // Collect a batch of domains to check
    const batch = []; // { domain, strategy }
    while (batch.length < batchSize) {
      const next = await generator.next();
      if (next.done) break;

      const { domain, strategy } = next.value;

      // Skip already checked
      if (wasChecked(domain)) continue;

      // Skip unaffordable TLDs
      const tld = '.' + domain.split('.').pop();
      if (!isAffordable(tld, config.maxPricePerYear)) continue;

      batch.push({ domain, strategy, tld });
    }

    if (batch.length === 0) break; // generator exhausted

    batchNum++;
    printBatchProgress(batchNum, batch.length);

    // Rate limit — one delay per batch
    await sleep(config.requestDelayMs);

    // Check entire batch
    const domainNames = batch.map(b => b.domain);
    const results = await checkDomainsBatch(domainNames);

    // Process results
    for (const { domain, strategy, tld } of batch) {
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
        // Save immediately when we find something
        await saveResults();
      } else if (result.available === false) {
        printTaken(domain);
      } else {
        printError(domain, result.reason ?? 'unknown');
      }
    }

    // Auto-save checked list periodically
    saveCounter += batch.length;
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
