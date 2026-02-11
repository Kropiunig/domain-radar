import dns from 'dns/promises';
import net from 'net';

// --- Primary: EPP-level check via domains.revved.com ---
// This is the same source of truth registrars use. Supports all TLDs.

const EPP_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Referer': 'https://www.namecheap.com/',
  'Origin': 'https://www.namecheap.com',
};

function parseEppEntry(entry) {
  const result = {
    method: 'epp',
    available: entry.available,
    ...(entry.reason ? { note: entry.reason } : {}),
  };
  if (entry.premium && entry.fee) {
    result.premium = true;
    result.eppPriceAmount = entry.fee.amount;
    result.eppPrice = `$${entry.fee.amount}/yr`;
  }
  return result;
}

async function checkEpp(domain) {
  try {
    const url = `https://domains.revved.com/v1/domainStatus?domains=${encodeURIComponent(domain)}`;
    const res = await fetch(url, {
      headers: EPP_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { method: 'epp', available: null, reason: `HTTP ${res.status}` };

    const data = await res.json();
    const entry = data.status?.find(s => s.name === domain);
    if (!entry) return { method: 'epp', available: null, reason: 'domain not in response' };

    return parseEppEntry(entry);
  } catch (err) {
    return { method: 'epp', available: null, reason: err.message };
  }
}

// --- Bulk EPP check: sends multiple domains in one request ---

async function checkEppBatch(domains) {
  const results = new Map();
  try {
    const query = domains.map(d => encodeURIComponent(d)).join(',');
    const url = `https://domains.revved.com/v1/domainStatus?domains=${query}`;
    const res = await fetch(url, {
      headers: EPP_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return results; // empty map — caller will fall back

    const data = await res.json();
    for (const entry of (data.status ?? [])) {
      results.set(entry.name, parseEppEntry(entry));
    }
  } catch {
    // return whatever we got — caller falls back for missing domains
  }
  return results;
}

// --- Fallback 1: RDAP ---

let rdapBootstrap = null;

async function loadBootstrap() {
  if (rdapBootstrap) return rdapBootstrap;
  try {
    const res = await fetch('https://data.iana.org/rdap/dns.json');
    const data = await res.json();
    rdapBootstrap = {};
    for (const [tlds, urls] of data.services) {
      for (const tld of tlds) {
        rdapBootstrap[tld] = urls[0];
      }
    }
  } catch {
    rdapBootstrap = {
      com: 'https://rdap.verisign.com/com/v1/',
      net: 'https://rdap.verisign.com/net/v1/',
      org: 'https://rdap.org.rdap.org/',
      dev: 'https://pubapi.registry.google/rdap/',
      app: 'https://pubapi.registry.google/rdap/',
    };
  }
  return rdapBootstrap;
}

function extractTld(domain) {
  return domain.split('.').pop();
}

async function checkRdap(domain) {
  const bootstrap = await loadBootstrap();
  const server = bootstrap[extractTld(domain)];
  if (!server) return { method: 'rdap', available: null, reason: 'no RDAP server' };

  const url = `${server.replace(/\/$/, '')}/domain/${domain}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      try {
        const body = await res.json();
        const desc = (body.description ?? []).join(' ').toLowerCase();
        if (desc.includes('blocked') || desc.includes('reserved') || desc.includes('not available')) {
          return { method: 'rdap', available: false, note: body.description?.join('; ') };
        }
      } catch {}
      return { method: 'rdap', available: true };
    }
    if (res.ok) return { method: 'rdap', available: false };
    return { method: 'rdap', available: null, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { method: 'rdap', available: null, reason: err.message };
  }
}

// --- Fallback 2: DNS NS records ---

async function checkDns(domain) {
  try {
    const ns = await dns.resolveNs(domain);
    if (ns.length > 0) return { method: 'dns', available: false };
  } catch (err) {
    if (err.code === 'ENOTFOUND') return { method: 'dns', available: true };
    if (err.code !== 'ENODATA') return { method: 'dns', available: null, reason: err.code };
  }
  return { method: 'dns', available: null, reason: 'inconclusive' };
}

// --- Main check: EPP first, then fallbacks ---

export async function checkDomain(domain) {
  // 1. EPP check — authoritative for ALL TLDs
  const epp = await checkEpp(domain);
  if (epp.available !== null) {
    return { domain, ...epp };
  }

  // 2. RDAP fallback
  const rdap = await checkRdap(domain);
  if (rdap.available !== null) {
    return { domain, ...rdap };
  }

  // 3. DNS NS fallback
  const dnsResult = await checkDns(domain);
  if (dnsResult.available !== null) {
    return { domain, ...dnsResult, note: 'DNS fallback — verify before purchasing' };
  }

  return { domain, method: 'unknown', available: null, reason: 'all checks inconclusive' };
}

// --- Batch check: EPP first, then individual fallbacks for misses ---

export async function checkDomainsBatch(domains) {
  const results = new Map();

  // 1. Bulk EPP check
  const eppResults = await checkEppBatch(domains);
  for (const [domain, result] of eppResults) {
    results.set(domain, { domain, ...result });
  }

  // 2. Individual fallback for domains EPP didn't resolve — in parallel
  const missed = domains.filter(d => !results.has(d));
  if (missed.length > 0) {
    const fallbacks = await Promise.allSettled(missed.map(d => checkDomain(d)));
    for (let i = 0; i < missed.length; i++) {
      if (fallbacks[i].status === 'fulfilled') {
        results.set(missed[i], fallbacks[i].value);
      }
    }
  }

  return results;
}

export async function warmupBootstrap() {
  await loadBootstrap();
}
