/**
 * Reads data/features-zip.geojson and writes data/build/zcta-tiles-input.geojson
 * with flat home_sales_YYYY props and has_metric for PMTiles / MapLibre.
 *
 * Run: node scripts/prepare-zcta-tiles-input.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function padZip(z) {
  return String(z).replace(/\D/g, "").padStart(5, "0").slice(0, 5);
}

function main() {
  const src = path.join(root, "data", "features-zip.geojson");
  const outDir = path.join(root, "data", "build");
  const outFile = path.join(outDir, "zcta-tiles-input.geojson");
  if (!fs.existsSync(src)) {
    console.error(`Missing ${src} — run npm run build:regions first.`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const fc = JSON.parse(fs.readFileSync(src, "utf8"));
  const features = [];
  for (const f of fc.features ?? []) {
    const p = { ...(f.properties ?? {}) };
    const zip = padZip(p.zip ?? "");
    if (!zip || zip === "00000") continue;
    p.zip = zip;
    p.region_type = "zip";
    const by = p.sales_by_year;
    if (by && typeof by === "object" && !Array.isArray(by)) {
      for (const k of Object.keys(by)) {
        const y = /^\d{4}$/.test(k) ? k : null;
        if (!y) continue;
        const v = by[k];
        if (v != null && v !== "") p[`home_sales_${y}`] = Number(v);
      }
    }
    const hasZhvi = p.zhvi != null && p.zhvi !== "";
    const hasSales = p.home_sales != null && p.home_sales !== "";
    p.has_metric = Boolean(hasZhvi || hasSales || p.zhvi_yoy != null || p.zhvi_mom != null);
    features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: p,
    });
  }
  fs.writeFileSync(
    outFile,
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  console.log(`Wrote ${outFile} (${features.length} features)`);
}

main();
