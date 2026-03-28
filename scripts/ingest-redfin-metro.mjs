/**
 * Minimal helper for Redfin Data Center CSVs (public download). Files vary by
 * release; this script expects columns similar to:
 *   REGION_TYPE, REGION, ... numeric month columns ...
 *
 * You must provide a mapping file TSV: region_key, lat, lng
 * where region_key matches REGION values (e.g. metro name) for rows you want on the map.
 *
 * Redfin: https://www.redfin.com/news/data-center/
 *
 * Usage:
 *   node scripts/ingest-redfin-metro.mjs --csv ./data/raw/redfin_metro.csv --geo ./data/raw/metro_latlng.tsv
 *
 * The script uses the last numeric column as the metric value. Adjust to your file.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--csv") out.csv = argv[++i];
    else if (a === "--geo") out.geo = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--prop") out.prop = argv[++i];
  }
  return out;
}

function parseCsvLine(line) {
  const row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') {
      q = !q;
    } else if ((c === "," && !q) || c === "\r") {
      row.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  row.push(cur);
  return row.map((s) => s.trim());
}

function readCsv(pathFile) {
  const text = fs.readFileSync(pathFile, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

function readGeoTsv(pathFile) {
  const text = fs.readFileSync(pathFile, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const ki = header.indexOf("region_key");
  const la = header.indexOf("lat");
  const ln = header.indexOf("lng");
  if (ki < 0 || la < 0 || ln < 0) {
    throw new Error("geo TSV needs columns: region_key, lat, lng");
  }
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const key = String(cols[ki]).trim().toLowerCase();
    const lat = Number(cols[la]);
    const lng = Number(cols[ln]);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    map.set(key, [lng, lat]);
  }
  return map;
}

const args = parseArgs(process.argv);
if (!args.csv || !args.geo) {
  console.error(
    "Usage: node scripts/ingest-redfin-metro.mjs --csv ./redfin.csv --geo ./metro_latlng.tsv [--out ./data/features.geojson] [--prop home_sales]",
  );
  process.exit(1);
}

const propName = args.prop || "home_sales";
const { header, rows } = readCsv(path.resolve(args.csv));
const geo = readGeoTsv(path.resolve(args.geo));

const regionIdx = header.findIndex((h) => h.toLowerCase() === "region");
if (regionIdx < 0) throw new Error("Expected REGION column");

const numericIdxs = header
  .map((h, i) => ({ h, i }))
  .filter(({ h }) => /^\d{4}-\d{2}-\d{2}$/.test(h) || /^\d{4}-\d{2}$/.test(h));

if (numericIdxs.length === 0) {
  throw new Error("Could not detect trailing date columns; check Redfin CSV format");
}
const lastNum = numericIdxs[numericIdxs.length - 1];

const features = [];
for (const row of rows) {
  const region = String(row[regionIdx] ?? "").trim();
  if (!region) continue;
  const coords = geo.get(region.toLowerCase());
  if (!coords) continue;
  const v = Number(row[lastNum.i]);
  if (!Number.isFinite(v)) continue;
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: {
      region_type: "metro",
      name: region,
      [propName]: v,
      data_note: "ingested_from_redfin_data_center_csv",
    },
  });
}

const fc = {
  type: "FeatureCollection",
  name: "redfin_metro_ingest",
  features,
};

const outPath = path.resolve(root, args.out || "data/features.geojson");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(fc, null, 2));
console.log(`Wrote ${features.length} features to ${outPath}`);
