/**
 * Load 2020 ZCTA polygons intersecting a WGS84 bounding box from the public
 * U.S. Census TIGERweb MapServer (layer 2), merged with local seed metrics.
 */

export const ZCTA_QUERY_BASE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/query";

/**
 * Bounding box for one ZCTA (WGS84). Used to fly the map to a ZIP like 92128.
 */
export async function fetchZctaExtentByZip(zip5) {
  const z = String(zip5).replace(/\D/g, "").padStart(5, "0");
  if (z.length !== 5) return null;
  const u = new URL(ZCTA_QUERY_BASE);
  u.searchParams.set("where", `ZCTA5='${z}'`);
  u.searchParams.set("returnExtentOnly", "true");
  u.searchParams.set("returnGeometry", "false");
  u.searchParams.set("outSR", "4326");
  u.searchParams.set("f", "json");
  const res = await fetch(u);
  if (!res.ok) return null;
  const j = await res.json();
  const e = j.extent;
  if (!e || typeof e.xmin !== "number") return null;
  return {
    zip: z,
    west: e.xmin,
    south: e.ymin,
    east: e.xmax,
    north: e.ymax,
  };
}

const PAGE_SIZE = 8000;
const MAX_OFFSET = 120000;

export function loadZipMetricsByZip(root, readJson) {
  const seed = readJson("data/zip-metrics-seed.geojson");
  const map = Object.create(null);
  for (const f of seed.features) {
    const z = String(f.properties?.zip ?? "").padStart(5, "0");
    if (!z || z === "00000") continue;
    map[z] = { ...f.properties, zip: z, region_type: "zip" };
  }
  return map;
}

/** Decimal degrees; coarser when zoomed out (smaller MapLibre zoom number). Omit for full detail. */
export function maxAllowableOffsetForZoom(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return undefined;
  if (z >= 12) return undefined;
  if (z >= 10) return 0.000025;
  if (z >= 9) return 0.000055;
  if (z >= 8.5) return 0.0001;
  return 0.0002;
}

/**
 * @param {Record<string, unknown>} props
 * @param {number} year
 */
export function resolveHomeSalesForYear(props, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) {
    const d = props.home_sales;
    return d != null && d !== "" ? Number(d) : null;
  }
  const by = props.sales_by_year;
  if (by && typeof by === "object" && !Array.isArray(by)) {
    const v = by[String(y)];
    if (v != null && v !== "") return Number(v);
  }
  const flat = props[`home_sales_${y}`];
  if (flat != null && flat !== "") return Number(flat);
  const d = props.home_sales;
  return d != null && d !== "" ? Number(d) : null;
}

export function collectSalesYearsFromSeed(readJson) {
  const seed = readJson("data/zip-metrics-seed.geojson");
  const years = new Set();
  for (const f of seed.features) {
    const p = f.properties ?? {};
    const by = p.sales_by_year;
    if (by && typeof by === "object" && !Array.isArray(by)) {
      for (const k of Object.keys(by)) {
        const n = Number(k);
        if (Number.isFinite(n) && n >= 1900 && n <= 2100) years.add(n);
      }
    }
    for (const key of Object.keys(p)) {
      const m = /^home_sales_(\d{4})$/.exec(key);
      if (m) years.add(Number(m[1]));
    }
  }
  const sorted = [...years].sort((a, b) => a - b);
  return sorted;
}

export function computeZipMetricRanges(readJson, salesYear) {
  const seed = readJson("data/zip-metrics-seed.geojson");
  const year = Number(salesYear);
  const useYear = Number.isFinite(year) && year >= 1900 && year <= 2100;
  const keys = [
    "zhvi",
    "zhvi_yoy",
    "zhvi_mom",
    "home_sales",
    "home_sales_yoy",
    "days_on_market",
  ];
  const out = Object.create(null);
  for (const k of keys) {
    let vals;
    if (k === "home_sales" && useYear) {
      vals = seed.features
        .map((f) => resolveHomeSalesForYear(f.properties ?? {}, year))
        .filter((v) => v != null && !Number.isNaN(Number(v)))
        .map((v) => Number(v));
    } else {
      vals = seed.features
        .map((f) => f.properties?.[k])
        .filter((v) => v != null && !Number.isNaN(Number(v)))
        .map((v) => Number(v));
    }
    if (vals.length > 0) {
      out[k] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
  }
  return out;
}

/**
 * Census-only polygons (no Zillow/seed fields). Safe to persist on disk; merge metrics at request time.
 */
export async function fetchZctaRawInBbox(west, south, east, north, zoom) {
  const lonSpan = east - west;
  const latSpan = north - south;
  if (lonSpan <= 0 || latSpan <= 0) {
    throw new Error("invalid_bbox");
  }
  const area = lonSpan * latSpan;
  const maxSpan = 7;
  const maxArea = 28;
  if (lonSpan > maxSpan || latSpan > maxSpan || area > maxArea) {
    return {
      geojson: { type: "FeatureCollection", features: [] },
      hint: "bbox_too_large",
    };
  }

  const geom = JSON.stringify({
    xmin: west,
    ymin: south,
    xmax: east,
    ymax: north,
    spatialReference: { wkid: 4326 },
  });

  const features = [];
  let offset = 0;

  for (;;) {
    const u = new URL(ZCTA_QUERY_BASE);
    u.searchParams.set("where", "1=1");
    u.searchParams.set("geometry", geom);
    u.searchParams.set("geometryType", "esriGeometryEnvelope");
    u.searchParams.set("inSR", "4326");
    u.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    u.searchParams.set("outFields", "ZCTA5,GEOID");
    u.searchParams.set("returnGeometry", "true");
    u.searchParams.set("outSR", "4326");
    u.searchParams.set("f", "geojson");
    u.searchParams.set("resultRecordCount", String(PAGE_SIZE));
    u.searchParams.set("resultOffset", String(offset));
    const mao = maxAllowableOffsetForZoom(zoom);
    if (mao != null) {
      u.searchParams.set("maxAllowableOffset", String(mao));
    }

    const res = await fetch(u);
    if (!res.ok) {
      throw new Error(`census_zcta_http_${res.status}`);
    }
    const chunk = await res.json();
    const chunkFeats = chunk.features ?? [];

    for (const f of chunkFeats) {
      const z = f.properties?.ZCTA5 ?? f.properties?.zcta5;
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          ZCTA5: z,
          GEOID: f.properties?.GEOID ?? null,
        },
      });
    }

    if (chunkFeats.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset >= MAX_OFFSET) break;
  }

  return { geojson: { type: "FeatureCollection", features }, hint: null };
}

/**
 * @param {{ type: string, features?: object[] }} geojson
 * @param {Record<string, object>} metricsByZip
 * @param {{ salesYear?: number }} [options]
 */
export function mergeZctaGeojsonWithMetrics(geojson, metricsByZip, options = {}) {
  const { salesYear } = options;
  const year = Number(salesYear);
  const useYear = Number.isFinite(year) && year >= 1900 && year <= 2100;
  const features = [];
  for (const f of geojson.features ?? []) {
    const raw = f.properties?.ZCTA5 ?? f.properties?.zcta5;
    const zip = String(raw).padStart(5, "0");
    const m = metricsByZip[zip];
    let props;
    if (m) {
      const base = { ...m, zip, region_type: "zip", has_metric: true, geoid: f.properties?.GEOID ?? null };
      if (useYear) {
        const s = resolveHomeSalesForYear(m, year);
        base.home_sales = s != null ? s : m.home_sales != null ? Number(m.home_sales) : null;
      }
      props = base;
    } else {
      props = {
        zip,
        region_type: "zip",
        has_metric: false,
        geoid: f.properties?.GEOID ?? null,
      };
    }
    features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: props,
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * @param {number} west
 * @param {number} south
 * @param {number} east
 * @param {number} north
 * @param {Record<string, object>} metricsByZip
 */
export async function fetchZctaInBbox(west, south, east, north, metricsByZip, zoom) {
  const raw = await fetchZctaRawInBbox(west, south, east, north, zoom);
  if (raw.hint) return raw;
  return {
    geojson: mergeZctaGeojsonWithMetrics(raw.geojson, metricsByZip),
    hint: null,
  };
}
