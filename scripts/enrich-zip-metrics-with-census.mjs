#!/usr/bin/env node
/**
 * Enrich data/zip-metrics-seed.geojson with public Census ACS ZIP(ZCTA) metrics.
 * Variables:
 * - B19013_001E: median household income
 * - B25064_001E: median gross rent
 * - B01003_001E: population
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const seedPath = path.join(root, 'data', 'zip-metrics-seed.geojson');

const ACS_URL =
  'https://api.census.gov/data/2023/acs/acs5?get=NAME,B19013_001E,B25064_001E,B01003_001E&for=zip%20code%20tabulation%20area:*';

function toNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function main() {
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Missing ${seedPath}`);
  }
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const res = await fetch(ACS_URL, { headers: { 'User-Agent': 'housing-data/1.0' } });
  if (!res.ok) throw new Error(`ACS fetch failed HTTP ${res.status}`);
  const rows = await res.json();
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const byZip = new Map();
  for (const r of rows.slice(1)) {
    const zip = String(r[idx['zip code tabulation area']] ?? '').padStart(5, '0');
    if (!zip || zip === '00000') continue;
    byZip.set(zip, {
      median_income: toNum(r[idx.B19013_001E]),
      median_rent: toNum(r[idx.B25064_001E]),
      population: toNum(r[idx.B01003_001E]),
    });
  }

  let updated = 0;
  for (const f of seed.features ?? []) {
    const p = f.properties ?? {};
    const zip = String(p.zip ?? '').padStart(5, '0');
    const c = byZip.get(zip);
    if (!c) continue;
    p.median_income = c.median_income;
    p.median_rent = c.median_rent;
    p.population = c.population;
    if (p.zhvi != null && c.median_income != null && c.median_income > 0) {
      p.price_to_income = Number(p.zhvi) / c.median_income;
    }
    f.properties = p;
    updated++;
  }

  fs.writeFileSync(seedPath, JSON.stringify(seed));
  console.log(`Enriched ${updated} ZIP entries with Census ACS metrics.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
