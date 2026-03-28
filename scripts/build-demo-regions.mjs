/**
 * Fetches 2020 ZCTA and CBSA (metro) polygon boundaries from the public
 * U.S. Census TIGERweb MapServer and merges demo metrics from zip-seed + metro list.
 *
 * Run: node scripts/build-demo-regions.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const ZCTA_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/query";
const MSA_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/93/query";

async function queryArcgisGeojson(baseUrl, where) {
  const params = new URLSearchParams({
    where,
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  const res = await fetch(`${baseUrl}?${params}`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function padZip(z) {
  return String(z).padStart(5, "0");
}

async function main() {
  const seedPath = path.join(root, "data", "zip-metrics-seed.geojson");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const byZip = {};
  for (const f of seed.features) {
    const z = padZip(f.properties?.zip ?? "");
    if (!z) continue;
    byZip[z] = { ...f.properties, region_type: "zip", zip: z };
  }
  const zips = Object.keys(byZip);
  const whereZip = zips.map((z) => `ZCTA5='${z}'`).join(" OR ");
  const zctaFc = await queryArcgisGeojson(ZCTA_URL, whereZip);

  const zipFeatures = zctaFc.features.map((f) => {
    const raw = f.properties?.ZCTA5 ?? f.properties?.zcta5;
    const zip = padZip(raw ?? "");
    const base = byZip[zip] ?? { zip, region_type: "zip", data_note: "no_metrics_seed" };
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        ...base,
        zip,
        geoid: f.properties?.GEOID ?? null,
        region_type: "zip",
      },
    };
  });

  const metroDefs = [
    {
      cbsa: "35620",
      name: "New York-Newark-Jersey City, NY-NJ-PA",
      zhvi: 612000,
      zhvi_yoy: 2.4,
      home_sales: 18200,
      home_sales_yoy: -5.1,
      days_on_market: 54,
    },
    {
      cbsa: "31080",
      name: "Los Angeles-Long Beach-Anaheim, CA",
      zhvi: 892000,
      zhvi_yoy: 3.1,
      home_sales: 12400,
      home_sales_yoy: -4.2,
      days_on_market: 41,
    },
    {
      cbsa: "16980",
      name: "Chicago-Naperville-Elgin, IL-IN-WI",
      zhvi: 318000,
      zhvi_yoy: 1.8,
      home_sales: 16800,
      home_sales_yoy: -2.9,
      days_on_market: 36,
    },
    {
      cbsa: "41860",
      name: "San Francisco-Oakland-Berkeley, CA",
      zhvi: 1050000,
      zhvi_yoy: -0.6,
      home_sales: 5100,
      home_sales_yoy: -8.4,
      days_on_market: 28,
    },
    {
      cbsa: "47900",
      name: "Washington-Arlington-Alexandria, DC-VA-MD-WV",
      zhvi: 548000,
      zhvi_yoy: 2.9,
      home_sales: 9200,
      home_sales_yoy: -3.5,
      days_on_market: 31,
    },
    {
      cbsa: "12060",
      name: "Atlanta-Sandy Springs-Alpharetta, GA",
      zhvi: 392000,
      zhvi_yoy: 3.6,
      home_sales: 22100,
      home_sales_yoy: 0.4,
      days_on_market: 33,
    },
    {
      cbsa: "19100",
      name: "Dallas-Fort Worth-Arlington, TX",
      zhvi: 365000,
      zhvi_yoy: 1.2,
      home_sales: 25400,
      home_sales_yoy: -1.8,
      days_on_market: 38,
    },
    {
      cbsa: "26420",
      name: "Houston-Pasadena-The Woodlands, TX",
      zhvi: 298000,
      zhvi_yoy: 2.0,
      home_sales: 19800,
      home_sales_yoy: 1.1,
      days_on_market: 42,
    },
    {
      cbsa: "42660",
      name: "Seattle-Tacoma-Bellevue, WA",
      zhvi: 678000,
      zhvi_yoy: 4.2,
      home_sales: 11200,
      home_sales_yoy: -4.8,
      days_on_market: 26,
    },
    {
      cbsa: "33100",
      name: "Miami-Fort Lauderdale-Pompano Beach, FL",
      zhvi: 455000,
      zhvi_yoy: 5.5,
      home_sales: 14300,
      home_sales_yoy: 2.2,
      days_on_market: 47,
    },
  ];

  const whereMetro = metroDefs.map((m) => `CBSA='${m.cbsa}'`).join(" OR ");
  const msaFc = await queryArcgisGeojson(MSA_URL, whereMetro);

  const byCbsa = Object.fromEntries(metroDefs.map((m) => [m.cbsa, m]));
  const metroFeatures = msaFc.features.map((f) => {
    const cbsa = String(f.properties?.CBSA ?? f.properties?.cbsa ?? "").padStart(5, "0");
    const def = byCbsa[cbsa] ?? { cbsa, name: f.properties?.NAME ?? "Metro" };
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        region_type: "metro",
        cbsa,
        metro_name: def.name,
        city: def.name,
        state: "",
        zhvi: def.zhvi ?? null,
        zhvi_yoy: def.zhvi_yoy ?? null,
        home_sales: def.home_sales ?? null,
        home_sales_yoy: def.home_sales_yoy ?? null,
        days_on_market: def.days_on_market ?? null,
        data_note:
          "Synthetic demo metrics only — not real market data; replace with public Zillow/Redfin research CSVs",
        geoid: f.properties?.GEOID ?? null,
      },
    };
  });

  fs.writeFileSync(
    path.join(root, "data", "features-zip.geojson"),
    JSON.stringify({ type: "FeatureCollection", name: "zcta_demo", features: zipFeatures }, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "data", "features-metro.geojson"),
    JSON.stringify({ type: "FeatureCollection", name: "cbsa_demo", features: metroFeatures }, null, 2),
  );

  console.log(`Wrote ${zipFeatures.length} ZIP polygons, ${metroFeatures.length} metro polygons.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
