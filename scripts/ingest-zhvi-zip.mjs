/**
 * Merge a Zillow Research ZIP-level ZHVI CSV (public download) with a ZIP→lat/lng TSV
 * to produce data/features.geojson.
 *
 * Zillow: https://www.zillow.com/research/data/  (choose a ZIP-level ZHVI file)
 *
 * Coordinates: Zillow research tables do not include map coordinates. This script
 * expects a simple TSV with columns: zip, lat, lng (you can build it from any
 * geography file you are licensed to use for coordinates only).
 *
 * Usage:
 *   node scripts/ingest-zhvi-zip.mjs --zhvi ./data/raw/zhvi_zip.csv --geo ./data/raw/zip_latlng.tsv
 *
 * If --zhvi is an http(s) URL, the file is downloaded once to data/raw/.cache/zillow_zhvi_zip.csv
 * and reused on later runs unless you pass --force-download.
 *
 * The script picks the latest numeric month column in the Zillow file as "zhvi",
 * the prior-year same month as "zhvi_yoy" when possible, and the immediately prior
 * month column as "zhvi_mom" when at least two month columns exist.
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
    if (a === "--zhvi") out.zhvi = argv[++i];
    else if (a === "--geo") out.geo = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--force-download") out.forceDownload = true;
  }
  return out;
}

const ZHVI_CACHE_FILE = "data/raw/.cache/zillow_zhvi_zip.csv";

async function resolveZhviPath(zhviArg, forceDownload) {
  if (!/^https?:\/\//i.test(zhviArg)) {
    return path.resolve(zhviArg);
  }
  const cachePath = path.join(root, ZHVI_CACHE_FILE);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  if (!forceDownload && fs.existsSync(cachePath)) {
    console.error(`Using cached Zillow CSV (skip download): ${cachePath}`);
    console.error("  Re-fetch: delete that file or pass --force-download");
    return cachePath;
  }
  console.error(`Downloading Zillow CSV → ${cachePath}`);
  const res = await fetch(zhviArg, {
    headers: { "User-Agent": "housing-market-map-ingest/1.0 (local research)" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status} — try saving the file manually from Zillow Research`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cachePath, buf);
  return cachePath;
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

function readTsvGeo(pathFile) {
  const text = fs.readFileSync(pathFile, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const zi = header.indexOf("zip");
  const la = header.indexOf("lat");
  const ln = header.indexOf("lng");
  if (zi < 0 || la < 0 || ln < 0) {
    throw new Error("geo TSV needs columns: zip, lat, lng (tab-separated)");
  }
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const zip = String(cols[zi]).padStart(5, "0");
    const lat = Number(cols[la]);
    const lng = Number(cols[ln]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    map.set(zip, [lng, lat]);
  }
  return map;
}

function monthColumns(header) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  return header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => re.test(h))
    .map(({ h, i }) => ({ name: h, i }));
}

const args = parseArgs(process.argv);
if (!args.zhvi || !args.geo) {
  console.error(
    "Usage: node scripts/ingest-zhvi-zip.mjs --zhvi <path-or-URL> --geo ./zip_latlng.tsv [--out ./data/features.geojson] [--force-download]",
  );
  process.exit(1);
}

const outPath = path.resolve(root, args.out || "data/features.geojson");

async function main() {
  const zhviPath = await resolveZhviPath(args.zhvi, Boolean(args.forceDownload));
  const { header, rows } = readCsv(zhviPath);
  const geo = readTsvGeo(path.resolve(args.geo));

  const regionNameIdx = header.findIndex(
    (h) => h.toLowerCase() === "regionname" || h.toLowerCase() === "region name",
  );
  const stateIdx = header.findIndex(
    (h) => h.toLowerCase() === "statename" || h.toLowerCase() === "state",
  );
  if (regionNameIdx < 0) {
    throw new Error("Could not find RegionName column in Zillow CSV");
  }

  const months = monthColumns(header);
  if (months.length < 2) {
    throw new Error("Could not find YYYY-MM-DD month columns in Zillow CSV");
  }
  const last = months[months.length - 1];
  const prevMonth = months.length >= 2 ? months[months.length - 2] : null;
  const prevYear = months.find((m) => {
    const d = new Date(m.name + "T12:00:00Z");
    const t = new Date(last.name + "T12:00:00Z");
    const y = new Date(t);
    y.setUTCFullYear(y.getUTCFullYear() - 1);
    return Math.abs(d.getTime() - y.getTime()) < 20 * 24 * 3600 * 1000;
  });

  const features = [];
  for (const row of rows) {
    const zipRaw = row[regionNameIdx];
    if (!zipRaw) continue;
    const zip = String(zipRaw).padStart(5, "0");
    const coords = geo.get(zip);
    if (!coords) continue;

    const zhvi = Number(row[last.i]);
    if (!Number.isFinite(zhvi)) continue;
    let zhvi_yoy = null;
    if (prevYear) {
      const old = Number(row[prevYear.i]);
      if (Number.isFinite(old) && old !== 0) {
        zhvi_yoy = ((zhvi - old) / old) * 100;
      }
    }
    let zhvi_mom = null;
    if (prevMonth) {
      const prevV = Number(row[prevMonth.i]);
      if (Number.isFinite(prevV) && prevV !== 0) {
        zhvi_mom = ((zhvi - prevV) / prevV) * 100;
      }
    }

    const state = stateIdx >= 0 ? row[stateIdx] : "";

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: {
        region_type: "zip",
        zip,
        state,
        zhvi,
        zhvi_yoy,
        zhvi_mom,
        data_note: "ingested_from_zillow_research_csv",
      },
    });
  }

  const fc = {
    type: "FeatureCollection",
    name: "zhvi_zip_ingest",
    features,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fc, null, 2));
  console.log(`Wrote ${features.length} features to ${outPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
