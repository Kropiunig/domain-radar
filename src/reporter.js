import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(__dirname, '..', 'data', 'results.json');
const STATUS_PATH = join(__dirname, '..', 'data', 'status.json');

let results = { found: [], checked: new Set() };

export async function loadResults() {
  try {
    const raw = await readFile(RESULTS_PATH, 'utf8');
    const data = JSON.parse(raw);
    results.found = data.found ?? [];
    results.checked = new Set(data.checked ?? []);
  } catch {
    results = { found: [], checked: new Set() };
  }
  return results;
}

export async function saveResults() {
  await mkdir(dirname(RESULTS_PATH), { recursive: true });
  await writeFile(
    RESULTS_PATH,
    JSON.stringify(
      {
        found: results.found,
        checked: [...results.checked],
        lastUpdated: new Date().toISOString(),
      },
      null,
      2
    )
  );
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
${c.cyan}${c.bold}  ____            _   ____                        _         ____        _
 / ___|___   ___ | | |  _ \\  ___  _ __ ___   __ _(_)_ __   / ___| _ __ (_)_ __   ___ _ __
| |   / _ \\ / _ \\| | | | | |/ _ \\| '_ \` _ \\ / _\` | | '_ \\  \\___ \\| '_ \\| | '_ \\ / _ \\ '__|
| |__| (_) | (_) | | | |_| | (_) | | | | | | (_| | | | | |  ___) | | | | | |_) |  __/ |
 \\____\\___/ \\___/|_| |____/ \\___/|_| |_| |_|\\__,_|_|_| |_| |____/|_| |_|_| .__/ \\___|_|
                                                                           |_|${c.reset}
  ${c.dim}Hunting for cool available domains...${c.reset}
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
  console.log(`\r  ${c.green}Results saved! (${count} domains in data/results.json)${c.reset}`);
}
