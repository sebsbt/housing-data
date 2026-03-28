/**
 * Builds data/tiles/zcta.pmtiles from data/build/zcta-tiles-input.geojson using tippecanoe.
 *
 * Prerequisites: run `node scripts/prepare-zcta-tiles-input.mjs` (or npm run build:regions first).
 *
 * Requires tippecanoe on PATH, or Docker:
 *   docker run --rm -v "%cd%:/data" ghcr.io/felt/tippecanoe:latest ...
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const input = path.join(root, "data", "build", "zcta-tiles-input.geojson");
const outDir = path.join(root, "data", "tiles");
const output = path.join(outDir, "zcta.pmtiles");

function tryTippecanoeLocal() {
  const args = [
    "-o",
    output,
    "-L",
    `zcta:${input}`,
    "-zg",
    "--drop-densest-as-needed",
    "--extend-zooms-if-still-dropping",
    "--force",
  ];
  const r = spawnSync("tippecanoe", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status === 0;
}

function tryTippecanoeDocker() {
  const inDocker = `/data/data/build/zcta-tiles-input.geojson`;
  const outDocker = `/data/data/tiles/zcta.pmtiles`;
  const args = [
    "run",
    "--rm",
    "-v",
    `${root}:/data`,
    "ghcr.io/jtmiclat/tippecanoe-docker:latest",
    "tippecanoe",
    "-o",
    outDocker,
    "-L",
    `zcta:${inDocker}`,
    "-zg",
    "--drop-densest-as-needed",
    "--extend-zooms-if-still-dropping",
    "--force",
  ];
  const r = spawnSync("docker", args, { stdio: "inherit" });
  return r.status === 0;
}

function main() {
  if (!fs.existsSync(input)) {
    console.error(`Missing ${input}. Run: node scripts/prepare-zcta-tiles-input.mjs`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  if (tryTippecanoeLocal()) {
    console.log(`Built ${output}`);
    return;
  }
  console.log("tippecanoe not found on PATH, trying Docker…");
  if (tryTippecanoeDocker()) {
    console.log(`Built ${output}`);
    return;
  }
  console.error(
    "Could not run tippecanoe. Install from https://github.com/felt/tippecanoe or use Docker.",
  );
  process.exit(1);
}

main();
