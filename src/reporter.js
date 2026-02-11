import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKED_PATH = join(__dirname, '..', 'data', 'checked.json');
const FOUND_PATH = join(__dirname, '..', 'data', 'found.json');
const STATUS_PATH = join(__dirname, '..', 'data', 'status.json');

let results = { found: [], checked: new Set() };

export async function loadResults() {
  // Load checked set (committed to repo)
  try {
    const raw = await readFile(CHECKED_PATH, 'utf8');
    results.checked = new Set(JSON.parse(raw));
  } catch {
    results.checked = new Set();
  }

  // Load found list (local only, gitignored)
  try {
    const raw = await readFile(FOUND_PATH, 'utf8');
    results.found = JSON.parse(raw);
  } catch {
    results.found = [];
  }

  // Backwards compat: migrate from old results.json
  try {
    const raw = await readFile(join(__dirname, '..', 'data', 'results.json'), 'utf8');
    const old = JSON.parse(raw);
    if (old.checked) {
      for (const d of old.checked) results.checked.add(d);
    }
    if (old.found) {
      const existing = new Set(results.found.map(f => f.domain));
      for (const entry of old.found) {
        if (!existing.has(entry.domain)) {
          results.found.push(entry);
          existing.add(entry.domain);
        }
      }
    }
  } catch {}

  return results;
}

export async function saveResults() {
  await mkdir(dirname(CHECKED_PATH), { recursive: true });

  // Save checked set (will be committed)
  await writeFile(CHECKED_PATH, JSON.stringify([...results.checked]));

  // Save found list (gitignored, encrypted separately)
  await writeFile(FOUND_PATH, JSON.stringify(results.found, null, 2));
}

export function wasChecked(domain) {
  return results.checked.has(domain);
}

export function markChecked(domain) {
  results.checked.add(domain);
}

export function addResult(entry) {
  results.found.push(entry);
}

export function getStats() {
  return {
    checked: results.checked.size,
    found: results.found.length,
  };
}

export async function saveStatus(statusData) {
  await mkdir(dirname(STATUS_PATH), { recursive: true });
  await writeFile(STATUS_PATH, JSON.stringify(statusData, null, 2));
}

// Terminal colors (no dependencies)
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

export function printBanner() {
  console.log(`
${c.cyan}${c.bold}  ____                        _         ____           _
 |  _ \\  ___  _ __ ___   __ _(_)_ __   |  _ \\ __ _  __| | __ _ _ __
 | | | |/ _ \\| '_ \` _ \\ / _\` | | '_ \\  | |_) / _\` |/ _\` |/ _\` | '__|
 | |_| | (_) | | | | | | (_| | | | | | |  _ < (_| | (_| | (_| | |
 |____/ \\___/|_| |_| |_|\\__,_|_|_| |_| |_| \\_\\__,_|\\__,_|\\__,_|_|${c.reset}
  ${c.dim}Scanning for available domains...${c.reset}
`);
}

export function printAvailable(domain, strategy, price) {
  console.log(
    `  ${c.bgGreen}${c.bold} AVAILABLE ${c.reset} ${c.green}${c.bold}${domain}${c.reset}  ${c.dim}[${strategy}]${c.reset}  ${c.yellow}${price}${c.reset}`
  );
}

export function printTaken(domain) {
  process.stdout.write(
    `\r  ${c.dim}checked: ${domain.padEnd(30)}${c.reset}`
  );
}

export function printError(domain, reason) {
  process.stdout.write(
    `\r  ${c.yellow}? ${domain.padEnd(30)} ${c.dim}(${reason})${c.reset}`
  );
}

export function printStats(checked, found) {
  console.log(
    `\n  ${c.cyan}${c.bold}Stats:${c.reset} ${checked} checked, ${c.green}${found} available${c.reset}\n`
  );
}

export function printSkippedPremium(domain, price) {
  process.stdout.write(
    `\r  ${c.yellow}$ ${domain.padEnd(30)} ${c.dim}(premium ${price} — too expensive)${c.reset}\n`
  );
}

export function printBatchProgress(batchNum, batchSize) {
  process.stdout.write(
    `\r  ${c.dim}batch #${batchNum} (${batchSize} domains)...${c.reset}`
  );
}

export function printSaving() {
  process.stdout.write(`\n  ${c.dim}Saving results...${c.reset}`);
}

export function printSaved(count) {
  console.log(`\r  ${c.green}Results saved! (${count} domains found)${c.reset}`);
}
