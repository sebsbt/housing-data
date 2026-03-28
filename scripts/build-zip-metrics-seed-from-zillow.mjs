#!/usr/bin/env node
/**
 * Build data/zip-metrics-seed.geojson from Zillow ZIP-level ZHVI public CSV.
 * Produces nationwide ZIP metric properties used by server merge for ZCTA polygons.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const DEFAULT_URL =
  'https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv';

function parseArgs(argv) {
  const out = { url: DEFAULT_URL, out: path.join(root, 'data', 'zip-metrics-seed.geojson') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--out') out.out = path.resolve(argv[++i]);
  }
  return out;
}

function parseCsvLine(line) {
  const row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') {
      q = !q;
    } else if ((c === ',' && !q) || c === '\r') {
      row.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  row.push(cur);
  return row.map((s) => s.trim());
}

function monthColumns(header) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  return header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => re.test(h));
}

function padZip(z) {
  return String(z ?? '').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Downloading Zillow ZIP ZHVI CSV from: ${args.url}`);
  const res = await fetch(args.url, {
    headers: { 'User-Agent': 'housing-data/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status}`);
  }
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error('CSV empty');

  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  const zipIdx = header.findIndex((h) => h.toLowerCase() === 'regionname');
  const stateIdx = header.findIndex((h) => h.toLowerCase() === 'state' || h.toLowerCase() === 'statename');
  const cityIdx = header.findIndex((h) => h.toLowerCase() === 'city');
  if (zipIdx < 0) throw new Error('RegionName not found in Zillow CSV');

  const months = monthColumns(header);
  if (months.length < 2) throw new Error('No month columns found');
  const latest = months[months.length - 1];
  const prevMonth = months[months.length - 2];

  // nearest same month last year
  const latestDate = new Date(`${latest.h}T12:00:00Z`);
  const target = new Date(latestDate);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const prevYear = months.find((m) => Math.abs(new Date(`${m.h}T12:00:00Z`).getTime() - target.getTime()) < 20 * 24 * 3600 * 1000);

  const features = [];
  for (const r of rows) {
    const zip = padZip(r[zipIdx]);
    if (!zip || zip === '00000') continue;
    const zhvi = Number(r[latest.i]);
    if (!Number.isFinite(zhvi)) continue;

    const pm = Number(r[prevMonth.i]);
    const py = prevYear ? Number(r[prevYear.i]) : NaN;

    const zhvi_mom = Number.isFinite(pm) && pm !== 0 ? ((zhvi - pm) / pm) * 100 : null;
    const zhvi_yoy = Number.isFinite(py) && py !== 0 ? ((zhvi - py) / py) * 100 : null;

    const state = stateIdx >= 0 ? r[stateIdx] : '';
    const city = cityIdx >= 0 ? r[cityIdx] : '';

    features.push({
      type: 'Feature',
      geometry: null,
      properties: {
        region_type: 'zip',
        zip,
        state,
        city,
        zhvi,
        zhvi_yoy,
        zhvi_mom,
        data_note: 'zillow_zip_public_ingest',
      },
    });
  }

  const fc = { type: 'FeatureCollection', name: 'zip_metrics_seed_zillow', features };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(fc));
  console.log(`Wrote ${features.length} ZIP metric features -> ${args.out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
