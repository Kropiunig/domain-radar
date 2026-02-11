import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const shardDirs = ['shards/prime', 'shards/tech', 'shards/alt', 'shards/fun'];
const checkedPath = join(root, 'data', 'checked.json');
const foundPath = join(root, 'data', 'found.json');
const statusPath = join(root, 'data', 'status.json');

// Load existing checked set from repo
let allChecked = new Set();
try {
  allChecked = new Set(JSON.parse(readFileSync(checkedPath, 'utf8')));
} catch {}

// Load existing found from repo (if any)
let allFound = [];
try {
  allFound = JSON.parse(readFileSync(foundPath, 'utf8'));
} catch {}

// Also try old results.json format for migration
try {
  const old = JSON.parse(readFileSync(join(root, 'data', 'results.json'), 'utf8'));
  if (old.checked) for (const d of old.checked) allChecked.add(d);
  if (old.found) {
    const existing = new Set(allFound.map(f => f.domain));
    for (const entry of old.found) {
      if (!existing.has(entry.domain)) {
        allFound.push(entry);
        existing.add(entry.domain);
      }
    }
  }
} catch {}

const existingDomains = new Set(allFound.map(f => f.domain));

// Merge each shard
for (const dir of shardDirs) {
  // Try new format first (checked.json + found.json)
  const shardChecked = join(root, dir, 'data', 'checked.json');
  const shardFound = join(root, dir, 'data', 'found.json');
  const shardOld = join(root, dir, 'data', 'results.json');

  if (existsSync(shardChecked)) {
    for (const d of JSON.parse(readFileSync(shardChecked, 'utf8'))) {
      allChecked.add(d);
    }
  }

  if (existsSync(shardFound)) {
    for (const entry of JSON.parse(readFileSync(shardFound, 'utf8'))) {
      if (!existingDomains.has(entry.domain)) {
        allFound.push(entry);
        existingDomains.add(entry.domain);
      }
    }
  }

  // Also try old format
  if (existsSync(shardOld)) {
    const shard = JSON.parse(readFileSync(shardOld, 'utf8'));
    for (const d of (shard.checked ?? [])) allChecked.add(d);
    for (const entry of (shard.found ?? [])) {
      if (!existingDomains.has(entry.domain)) {
        allFound.push(entry);
        existingDomains.add(entry.domain);
      }
    }
  }
}

// Write merged data
mkdirSync(dirname(checkedPath), { recursive: true });
writeFileSync(checkedPath, JSON.stringify([...allChecked]));
writeFileSync(foundPath, JSON.stringify(allFound, null, 2));

// Merge status
let mergedStatus = { running: false };
for (const dir of shardDirs) {
  const sp = join(root, dir, 'data', 'status.json');
  if (!existsSync(sp)) continue;
  const status = JSON.parse(readFileSync(sp, 'utf8'));
  if (!mergedStatus.lastCompleted || (status.lastCompleted && status.lastCompleted > mergedStatus.lastCompleted)) {
    mergedStatus = { ...status };
  }
}
mergedStatus.domainsChecked = allChecked.size;
mergedStatus.domainsFound = allFound.length;
writeFileSync(statusPath, JSON.stringify(mergedStatus, null, 2));

console.log(`Merged: ${allChecked.size.toLocaleString()} checked, ${allFound.length.toLocaleString()} found`);
