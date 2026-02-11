import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const shardDirs = ['shards/prime', 'shards/tech', 'shards/alt', 'shards/fun'];
const outputResults = join(root, 'data', 'results.json');
const outputStatus = join(root, 'data', 'status.json');

// Load existing results from repo (baseline)
let allFound = [];
let allChecked = new Set();

try {
  const existing = JSON.parse(readFileSync(outputResults, 'utf8'));
  allFound = existing.found ?? [];
  allChecked = new Set(existing.checked ?? []);
} catch {}

// Merge each shard
for (const dir of shardDirs) {
  const resultsPath = join(root, dir, 'data', 'results.json');
  if (!existsSync(resultsPath)) continue;

  const shard = JSON.parse(readFileSync(resultsPath, 'utf8'));

  // Merge checked domains
  for (const d of (shard.checked ?? [])) {
    allChecked.add(d);
  }

  // Merge found domains (deduplicate by domain name)
  const existingDomains = new Set(allFound.map(f => f.domain));
  for (const entry of (shard.found ?? [])) {
    if (!existingDomains.has(entry.domain)) {
      allFound.push(entry);
      existingDomains.add(entry.domain);
    }
  }
}

// Write merged results
mkdirSync(dirname(outputResults), { recursive: true });
writeFileSync(outputResults, JSON.stringify({
  found: allFound,
  checked: [...allChecked],
  lastUpdated: new Date().toISOString(),
}, null, 2));

// Merge status — pick the most recent completion
let mergedStatus = { running: false };
for (const dir of shardDirs) {
  const statusPath = join(root, dir, 'data', 'status.json');
  if (!existsSync(statusPath)) continue;

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  if (!mergedStatus.lastCompleted || (status.lastCompleted && status.lastCompleted > mergedStatus.lastCompleted)) {
    mergedStatus = { ...status };
  }
  mergedStatus.domainsChecked = allChecked.size;
  mergedStatus.domainsFound = allFound.length;
}

writeFileSync(outputStatus, JSON.stringify(mergedStatus, null, 2));

console.log(`Merged: ${allChecked.size} checked, ${allFound.length} found`);
