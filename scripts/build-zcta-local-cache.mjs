#!/usr/bin/env node
/**
 * Build full local ZCTA geometry cache from Census TIGERweb API and merge ZIP metrics.
 * This enables fast local bbox filtering (no remote TIGER call per viewport).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const ZCTA_QUERY_BASE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/query";

const PAGE_SIZE = 5000;
const MAX_OFFSET = 200000;

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function padZip(z) {
  return String(z ?? "").replace(/\D/g, "").padStart(5, "0").slice(0, 5);
}

async function fetchAllZctaRaw() {
  const features = [];
  let offset = 0;
  for (;;) {
    const u = new URL(ZCTA_QUERY_BASE);
    u.searchParams.set("where", "1=1");
    u.searchParams.set("outFields", "ZCTA5,GEOID");
    u.searchParams.set("returnGeometry", "true");
    u.searchParams.set("outSR", "4326");
    u.searchParams.set("f", "geojson");
    u.searchParams.set("resultRecordCount", String(PAGE_SIZE));
    u.searchParams.set("resultOffset", String(offset));

    const res = await fetch(u, { headers: { "User-Agent": "housing-data/1.0" } });
    if (!res.ok) throw new Error(`census_zcta_http_${res.status}`);
    const chunk = await res.json();
    const chunkFeats = chunk.features ?? [];
    features.push(...chunkFeats);
    console.log(`Fetched chunk offset=${offset}, count=${chunkFeats.length}, total=${features.length}`);

    if (chunkFeats.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset >= MAX_OFFSET) break;
  }
  return { type: "FeatureCollection", features };
}

function mergeWithSeed(rawFc, seedByZip) {
  const out = [];
  for (const f of rawFc.features ?? []) {
    const raw = f.properties?.ZCTA5 ?? f.properties?.zcta5;
    const zip = padZip(raw);
    if (!zip || zip === "00000") continue;
    const m = seedByZip[zip];
    const props = m
      ? { ...m, zip, region_type: "zip", geoid: f.properties?.GEOID ?? null, has_metric: true }
      : { zip, region_type: "zip", geoid: f.properties?.GEOID ?? null, has_metric: false };
    out.push({ type: "Feature", geometry: f.geometry, properties: props });
  }
  return { type: "FeatureCollection", features: out };
}

async function main() {
  const seed = readJson("data/zip-metrics-seed.geojson");
  const byZip = Object.create(null);
  for (const f of seed.features ?? []) {
    const z = padZip(f.properties?.zip);
    if (!z || z === "00000") continue;
    byZip[z] = { ...(f.properties ?? {}), zip: z, region_type: "zip" };
  }

  const raw = await fetchAllZctaRaw();
  const merged = mergeWithSeed(raw, byZip);

  const buildDir = path.join(root, "data", "build");
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, "zcta-raw-all.geojson"), JSON.stringify(raw));
  fs.writeFileSync(path.join(root, "data", "features-zip.geojson"), JSON.stringify(merged));
  console.log(`Wrote full local ZCTA cache with ${merged.features.length} ZIP polygons`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
