import compression from "compression";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  readZctaExtentDisk,
  readZctaViewportDisk,
  writeZctaExtentDisk,
  writeZctaViewportDisk,
} from "./zctaDiskCache.mjs";
import {
  collectSalesYearsFromSeed,
  computeZipMetricRanges,
  fetchZctaExtentByZip,
  fetchZctaRawInBbox,
  loadZipMetricsByZip,
  mergeZctaGeojsonWithMetrics,
} from "./zctaViewport.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3001);
/** Dev defaults to loopback only. Production defaults to all interfaces (Docker/Railway). Override anytime: LISTEN_HOST=0.0.0.0 */
const listenHost =
  process.env.LISTEN_HOST || (isProd ? "0.0.0.0" : "127.0.0.1");

const app = express();
app.use(compression());

const zctaPmtilesPath = path.join(root, "data", "tiles", "zcta.pmtiles");
function zipPmtilesExists() {
  // Default OFF to avoid showing only a limited seeded ZIP subset when PMTiles isn't full coverage.
  // Turn on explicitly with ENABLE_ZIP_PMTILES=true after building full nationwide tiles.
  const explicit = String(process.env.ENABLE_ZIP_PMTILES || "").toLowerCase();
  if (explicit !== "true" && explicit !== "1") return false;
  try {
    return fs.existsSync(zctaPmtilesPath);
  } catch {
    return false;
  }
}

app.use("/tiles", express.static(path.join(root, "data", "tiles")));

app.get("/api/config", (_req, res) => {
  res.json({
    zipPmtiles: zipPmtilesExists(),
    zipPmtilesUrl: "/tiles/zcta.pmtiles",
  });
});

function readJson(relPath) {
  const full = path.join(root, relPath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

let zipMetricsByZip;
try {
  zipMetricsByZip = loadZipMetricsByZip(root, readJson);
} catch {
  zipMetricsByZip = Object.create(null);
}

/** Tableau-like: cache repeated viewport queries so pan/zoom feels instant. */
const zctaViewportCache = new Map();
const ZCTA_CACHE_MAX = 56;

function zctaCacheKey(west, south, east, north, zoom) {
  const r = (x) => Math.round(x * 200) / 200;
  const z = Number(zoom);
  const zTier = Number.isFinite(z) ? Math.round(z * 4) / 4 : 10;
  return `${r(west)},${r(south)},${r(east)},${r(north)},z${zTier}`;
}

/** Raw Census payload in LRU/disk; merge seed metrics on every response. */
function mergeZctaViewportPayload(raw, mergeOpts) {
  if (raw.hint === "bbox_too_large") return raw;
  return {
    geojson: mergeZctaGeojsonWithMetrics(raw.geojson, zipMetricsByZip, mergeOpts),
    hint: null,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/metrics", (_req, res) => {
  try {
    const metrics = readJson("data/metrics.json");
    res.json(metrics);
  } catch (e) {
    res.status(500).json({ error: "metrics_unavailable" });
  }
});

app.get("/api/zip-metric-ranges", (req, res) => {
  try {
    const y = req.query.year != null ? Number(req.query.year) : NaN;
    const salesYear = Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : undefined;
    res.json(computeZipMetricRanges(readJson, salesYear));
  } catch (e) {
    res.status(500).json({ error: "zip_metric_ranges_failed" });
  }
});

app.get("/api/sales-years", (_req, res) => {
  try {
    const years = collectSalesYearsFromSeed(readJson);
    const def = years.length > 0 ? years[years.length - 1] : new Date().getFullYear();
    res.json({
      years,
      defaultYear: def,
      min: years[0] ?? def,
      max: years[years.length - 1] ?? def,
    });
  } catch {
    const y = new Date().getFullYear();
    res.json({ years: [], defaultYear: y, min: y, max: y });
  }
});

app.get("/api/zip-extent", async (req, res) => {
  const raw = String(req.query.zip ?? "").replace(/\D/g, "");
  if (raw.length !== 5) {
    res.status(400).json({ error: "bad_zip" });
    return;
  }
  try {
    const cached = readZctaExtentDisk(root, raw);
    if (cached) {
      res.json(cached);
      return;
    }
    const ext = await fetchZctaExtentByZip(raw);
    if (!ext) {
      res.status(404).json({ error: "zip_not_found" });
      return;
    }
    writeZctaExtentDisk(root, raw, ext);
    res.json(ext);
  } catch (e) {
    res.status(502).json({
      error: "zip_extent_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get("/api/zcta-viewport", async (req, res) => {
  const west = Number(req.query.west);
  const south = Number(req.query.south);
  const east = Number(req.query.east);
  const north = Number(req.query.north);
  if ([west, south, east, north].some((v) => Number.isNaN(v))) {
    res.status(400).json({ error: "bad_bbox" });
    return;
  }
  const zoom = req.query.zoom != null ? Number(req.query.zoom) : NaN;
  const mapZoom = Number.isFinite(zoom) ? zoom : 10;
  const yearQ = req.query.year != null ? Number(req.query.year) : NaN;
  const salesYear =
    Number.isFinite(yearQ) && yearQ >= 1900 && yearQ <= 2100 ? yearQ : undefined;
  const mergeOpts = salesYear != null ? { salesYear } : {};

  try {
    const key = zctaCacheKey(west, south, east, north, mapZoom);
    const memRaw = zctaViewportCache.get(key);
    if (memRaw) {
      res.json(mergeZctaViewportPayload(memRaw, mergeOpts));
      return;
    }
    const diskRaw = readZctaViewportDisk(root, key);
    if (diskRaw) {
      if (zctaViewportCache.size >= ZCTA_CACHE_MAX) {
        const first = zctaViewportCache.keys().next().value;
        zctaViewportCache.delete(first);
      }
      zctaViewportCache.set(key, diskRaw);
      res.json(mergeZctaViewportPayload(diskRaw, mergeOpts));
      return;
    }
    const raw = await fetchZctaRawInBbox(west, south, east, north, mapZoom);
    writeZctaViewportDisk(root, key, raw);
    if (zctaViewportCache.size >= ZCTA_CACHE_MAX) {
      const first = zctaViewportCache.keys().next().value;
      zctaViewportCache.delete(first);
    }
    zctaViewportCache.set(key, raw);
    res.json(mergeZctaViewportPayload(raw, mergeOpts));
  } catch (e) {
    res.status(502).json({
      error: "zcta_fetch_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

function featuresPath(geography) {
  if (geography === "metro") return "data/features-metro.geojson";
  if (geography === "zip") return "data/features-zip.geojson";
  return "data/features.geojson";
}

app.get("/api/features", (req, res) => {
  try {
    const geography =
      req.query.geography === "metro"
        ? "metro"
        : req.query.geography === "zip"
          ? "zip"
          : "zip";
    let fc;
    try {
      fc = readJson(featuresPath(geography));
    } catch {
      fc = readJson("data/features.geojson");
    }
    const metric = req.query.metric;
    const min = req.query.min ? Number(req.query.min) : null;
    const max = req.query.max ? Number(req.query.max) : null;

    if (!metric || typeof metric !== "string") {
      res.json(fc);
      return;
    }

    const filtered = {
      ...fc,
      features: fc.features.filter((f) => {
        const v = f.properties?.[metric];
        if (v == null || Number.isNaN(Number(v))) return false;
        const n = Number(v);
        if (min != null && !Number.isNaN(min) && n < min) return false;
        if (max != null && !Number.isNaN(max) && n > max) return false;
        return true;
      }),
    };
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: "features_unavailable" });
  }
});

if (isProd) {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(port, listenHost, () => {
  // eslint-disable-next-line no-console
  const scope =
    listenHost === "127.0.0.1" || listenHost === "::1"
      ? " (loopback only)"
      : "";
  console.log(
    `[housing-map] API ${isProd ? "+ static " : ""}http://${listenHost}:${port}${scope}`,
  );
});
