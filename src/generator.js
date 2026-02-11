import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let wordList = null;

async function loadWords() {
  if (wordList) return wordList;
  const raw = await readFile(join(__dirname, '..', 'data', 'words.json'), 'utf8');
  wordList = JSON.parse(raw);
  return wordList;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Strategy 1: Short & catchy words + TLDs
export function* shortAndCatchy(tlds) {
  const words = shuffle(wordList ?? []);
  const shuffledTlds = shuffle(tlds);
  for (const word of words) {
    for (const tld of shuffledTlds) {
      yield `${word}${tld}`;
    }
  }
}

// Strategy 2: Keyword-based variations (expanded)
const PREFIXES = ['get', 'try', 'use', 'hey', 'my', 'go', 'the', 'on', 'to', 'we', 'so', 'its', 'run', 'ask', 'no', 'all', 'be', 'do', 'hi', 'oh', 'yo', 'is', 'by', 'up', 'one', 'new', 'hot', 'top', 'big', 'raw', 'pro', 'sub', 'pre', 'neo', 're'];
const SUFFIXES = ['hq', 'app', 'dev', 'lab', 'hub', 'ly', 'ify', 'up', 'now', 'ai', 'io', 'os', 'run', 'go', 'pro', 'box', 'kit', 'ops', 'it', 'er', 'ed', 'fy', 'sy', 'zy', 'on', 'an', 'in', 'en', 'x', 'z', 'co', 'me', 'to', 'db', 'ui', 'api', 'cli', 'net', 'web', 'log', 'bot', 'bit', 'way', 'max', 'pod', 'zen'];

export function* keywordBased(keywords, tlds) {
  const shuffledKeywords = shuffle(keywords);
  const shuffledTlds = shuffle(tlds);

  for (const keyword of shuffledKeywords) {
    for (const tld of shuffledTlds) {
      yield `${keyword}${tld}`;
    }
    for (const prefix of shuffle(PREFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${prefix}${keyword}${tld}`;
      }
    }
    for (const suffix of shuffle(SUFFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${keyword}${suffix}${tld}`;
      }
    }
  }
}

// Strategy 3: Personal name variations (expanded)
const NAME_PREFIXES = ['hey', 'ask', 'get', 'hi', 'by', 'its', 'im', 'the', 'yo', 'mr', 'dr', 'go', 'oh', 'am', 'be', 'do', 'my', 'so', 'we', 'not', 'for', 'sir', 'pro', 'hey'];
const NAME_SUFFIXES = ['hq', 'dev', 'lab', 'code', 'builds', 'works', 'tech', 'hub', 'ops', 'ai', 'app', 'run', 'pro', 'craft', 'zone', 'stack', 'verse', 'space', 'net', 'web', 'log', 'box', 'bot', 'land', 'camp', 'base', 'core', 'lite', 'max', 'now', 'xyz', 'io'];

export function* personalNames(names, tlds) {
  const shuffledNames = shuffle(names);
  const shuffledTlds = shuffle(tlds);

  for (const name of shuffledNames) {
    for (const tld of shuffledTlds) {
      yield `${name}${tld}`;
    }
    for (const prefix of shuffle(NAME_PREFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${prefix}${name}${tld}`;
      }
    }
    for (const suffix of shuffle(NAME_SUFFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${name}${suffix}${tld}`;
      }
    }
  }
}

// Strategy 4: Short combos — 3-letter on all TLDs + 4-letter on valuable TLDs
const CHARS = 'abcdefghijklmnopqrstuvwxyz';

export async function* shortCombos(tlds) {
  // 3-letter combos on ALL TLDs (17,576 × TLDs)
  const threeLetterCombos = [];
  for (let a = 0; a < 26; a++) {
    for (let b = 0; b < 26; b++) {
      for (let c = 0; c < 26; c++) {
        threeLetterCombos.push(`${CHARS[a]}${CHARS[b]}${CHARS[c]}`);
      }
    }
  }

  const shuffled3 = shuffle(threeLetterCombos);
  const shuffledTlds = shuffle(tlds);
  for (const combo of shuffled3) {
    for (const tld of shuffledTlds) {
      yield `${combo}${tld}`;
    }
  }

  // 4-letter combos on cheap TLDs (456,976 × TLDs = millions of domains)
  const cheapTlds = shuffle(tlds.filter(t => ['.dev', '.xyz', '.cool', '.lol', '.sh'].includes(t)));
  if (cheapTlds.length === 0) return;

  const fourLetterCombos = [];
  for (let a = 0; a < 26; a++) {
    for (let b = 0; b < 26; b++) {
      for (let c = 0; c < 26; c++) {
        for (let d = 0; d < 26; d++) {
          fourLetterCombos.push(`${CHARS[a]}${CHARS[b]}${CHARS[c]}${CHARS[d]}`);
        }
      }
    }
  }

  const shuffled4 = shuffle(fourLetterCombos);
  for (const combo of shuffled4) {
    for (const tld of cheapTlds) {
      yield `${combo}${tld}`;
    }
  }
}

// Strategy 5: Word combinations — word+word mashups
export function* wordCombos(tlds) {
  const words = shuffle(wordList ?? []);
  const short = words.filter(w => w.length <= 4);
  const shuffledTlds = shuffle(tlds);

  // Pick random pairs of short words
  const pairs = [];
  for (const a of short) {
    for (const b of short) {
      if (a !== b && (a.length + b.length) <= 8) {
        pairs.push(a + b);
      }
    }
  }

  const shuffledPairs = shuffle(pairs);
  for (const combo of shuffledPairs) {
    for (const tld of shuffledTlds) {
      yield `${combo}${tld}`;
    }
  }
}

// Strategy 6: 2-letter domains — only 676 per TLD, worth checking all
export function* twoLetterDomains(tlds) {
  const combos = [];
  for (let a = 0; a < 26; a++) {
    for (let b = 0; b < 26; b++) {
      combos.push(`${CHARS[a]}${CHARS[b]}`);
    }
  }

  const shuffled = shuffle(combos);
  const shuffledTlds = shuffle(tlds);
  for (const combo of shuffled) {
    for (const tld of shuffledTlds) {
      yield `${combo}${tld}`;
    }
  }
}

// Strategy 7: Word + number combos (word1, word2, word3, etc.)
export function* wordNumbers(tlds) {
  const words = shuffle(wordList ?? []).filter(w => w.length <= 5);
  const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '01', '10', '11', '42', '69', '99', '007', '101', '123', '256', '404', '420', '500', '666', '777', '888', '999'];
  const shuffledTlds = shuffle(tlds);

  for (const word of words) {
    for (const num of shuffle(numbers)) {
      for (const tld of shuffledTlds) {
        yield `${word}${num}${tld}`;
      }
    }
  }
}

// Main generator that cycles through all strategies
export async function* generateDomains(config) {
  await loadWords();

  const { keywords, personalNames: names, tlds, strategies } = config;

  const generators = [];

  // Always include 2-letter (tiny search space, high value)
  generators.push({ name: '2-Letter', gen: twoLetterDomains(tlds) });

  if (strategies.includes('short')) {
    generators.push({ name: 'Short & Catchy', gen: shortAndCatchy(tlds) });
  }
  if (strategies.includes('keyword')) {
    generators.push({ name: 'Keyword-Based', gen: keywordBased(keywords, tlds) });
  }
  if (strategies.includes('personal')) {
    generators.push({ name: 'Alex-Themed', gen: personalNames(names, tlds) });
  }
  if (strategies.includes('expired')) {
    generators.push({ name: 'Short Combos', gen: shortCombos(tlds) });
  }

  // New strategies — always enabled
  generators.push({ name: 'Word Combos', gen: wordCombos(tlds) });
  generators.push({ name: 'Word+Number', gen: wordNumbers(tlds) });

  // Round-robin through strategies
  let activeGens = [...generators];
  while (activeGens.length > 0) {
    const nextActive = [];
    for (const { name, gen } of activeGens) {
      const result = await gen.next();
      if (!result.done) {
        yield { domain: result.value, strategy: name };
        nextActive.push({ name, gen });
      }
    }
    activeGens = nextActive;
  }
}
