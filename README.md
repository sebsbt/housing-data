# Housing Market Map (Reventure-style demo)

Interactive **dark map + sidebar** UI inspired by [Reventure’s housing map](https://www.reventure.app/map): geography pills, “popular data” metrics, filters, popups, and table view.

This repo is a **local / Docker / Railway**-friendly stack:

- **Frontend:** Vite + React + [MapLibre GL](https://maplibre.org/) (Carto *Dark Matter* basemap).
- **Tableau-style map UX (borrowed patterns):** always-visible **color legend** (gradient + formatted low/high + “no data” swatch for ZIP mode), **tabular numeric formatting** in popups (currency / % / counts like sheet tooltips), and **server-side viewport caching** for ZIP fetches so revisiting an area is snappy.
- **Backend:** Express serves `/api/*` and the production SPA.
- **Regions (ZIP):** If **`data/tiles/zcta.pmtiles`** exists, ZIP mode uses **vector tiles** (MapLibre + [PMTiles](https://github.com/protomaps/pmtiles)) served at **`/tiles/zcta.pmtiles`** with metrics baked in from `features-zip` (including per-year `home_sales_YYYY` for the year slider). Otherwise ZIP mode loads **every 2020 ZCTA in the viewport** via `GET /api/zcta-viewport` (Census TIGERweb), with **in-memory + disk** cache under `data/cache/zcta-viewport/`. **Metro** view uses bundled `features-metro.geojson`. **Zillow-style numbers** come from `data/zip-metrics-seed.geojson` at server start (not from live Zillow APIs). **Hover** highlights in **amber**; **click** opens the popup.
- **Build ZIP vector tiles:** after `npm run build:regions`, run **`npm run build:pmtiles`** (needs [tippecanoe](https://github.com/felt/tippecanoe) on `PATH` or Docker with `ghcr.io/jtmiclat/tippecanoe-docker:latest`). Vite dev proxies **`/tiles`** to the API like **`/api`**.
- **Home sales by year:** Seed ZIPs can include a `sales_by_year` object (e.g. `"2022": 40`). Use **`GET /api/sales-years`** for the year list; **`GET /api/zip-metric-ranges?year=YYYY`** and **`GET /api/zcta-viewport?...&year=YYYY`** apply that year to merged `home_sales`. The UI shows a **year slider and play control** when **Home sales** is selected in Zip mode.
- **Metrics files:** `data/features-zip.geojson`, `data/features-metro.geojson`, and `data/metrics.json`. Bundled demo dollar/count/% values are **synthetic placeholders**, not proprietary or live listing data — replace them using **only** publicly available, vendor-published research files (see Data policy below).

Regenerate boundaries + merge demo metrics (requires network):

```bash
npm run build:regions
```

Reads `data/zip-metrics-seed.geojson` and refreshes `features-zip.geojson` / `features-metro.geojson`.

Optional: **`npm run build:pmtiles`** — writes `data/tiles/zcta.pmtiles` for faster ZIP rendering (see Regions above).

## Data policy: public sources only

This repository is intended to use **only publicly available data** that you obtain yourself under each provider’s published terms:

- **No proprietary or licensed third-party datasets** are bundled, committed, or required to run the demo.
- **No scraping** of consumer listing sites or private APIs — use **official research downloads** and **government open data** only.
- **Zillow:** public research datasets from [Zillow Research Data](https://www.zillow.com/research/data/) (e.g. ZHVI CSVs), per Zillow’s terms for those files.
- **Redfin:** public files from the [Redfin Data Center](https://www.redfin.com/news/data-center/), per Redfin’s terms for those files.
- **Map boundaries:** U.S. Census TIGERweb / ZCTA and related cartographic layers (public domain).

Zillow/Redfin research tables are keyed by region (ZIP, metro, etc.) and **do not include map polygons**. This app joins your metrics to **Census** boundaries for visualization. For coordinates-only workflows, `scripts/ingest-zhvi-zip.mjs` supports a ZIP→lat/lng TSV built from any geography source **you are allowed to use**. You are responsible for complying with each data provider’s license and attribution requirements.

## Run locally

```bash
npm install
npm run dev
```

- UI: **`http://127.0.0.1:5173`** (recommended; Vite proxies `/api` and `/tiles` → `3001`)
- API only: `http://127.0.0.1:3001/api/health`

**Network binding:** In development, the API and Vite listen on **127.0.0.1** only (not exposed to your LAN). Production (`NODE_ENV=production`) still listens on **0.0.0.0** so Docker and hosts like Railway can accept inbound traffic. To bind the API differently, set **`LISTEN_HOST`** (e.g. `LISTEN_HOST=0.0.0.0` if you intentionally want LAN access while developing).

Production-style (single port):

```bash
npm run build
set NODE_ENV=production
set PORT=8080
node server/index.mjs
```

Open `http://127.0.0.1:8080` (compose maps the container to loopback on your machine).

### “Could not load map data”

- **Development:** After `npm run dev`, open **`http://127.0.0.1:5173`** (Vite proxies **`/api`** and **`/tiles`** to **`127.0.0.1:3001`**). Vite waits for the API to accept connections before starting, but if you only run `vite` without **`npm run dev:api`**, `/api` requests fail. **`http://localhost:5173`** usually works; on Windows, if the UI loads but data fails, try **`127.0.0.1`** instead of `localhost` (IPv6 vs IPv4). Opening **`http://127.0.0.1:3001` directly** only hits the API (no SPA in dev), and opening **`dist/index.html` from disk** breaks `/api` requests.
- **Stale process on 3001:** If `/api/health` works but the app still errors, another or older server may be bound to `3001`. Stop stray `node` processes (or whatever uses that port) and run `npm run dev` again so routes like `/api/zip-metric-ranges` exist.

## Docker

```bash
docker compose up --build
```

Then open `http://127.0.0.1:8080`. The compose file publishes the port on **loopback only**; change the `ports` mapping to `8080:8080` if you need LAN access (not recommended on untrusted networks).

## Ingest real Zillow ZIP ZHVI

1. Download a ZIP-level ZHVI CSV from Zillow Research.
2. Build `data/raw/zip_latlng.tsv` (tab-separated) with columns: `zip`, `lat`, `lng`.
3. Run:

```bash
node scripts/ingest-zhvi-zip.mjs --zhvi ./data/raw/zhvi_zip.csv --geo ./data/raw/zip_latlng.tsv
```

You can pass a **URL** as `--zhvi` instead of a path; the CSV is downloaded once to `data/raw/.cache/zillow_zhvi_zip.csv` and reused on later runs (use `--force-download` to replace it). Zillow may block automated downloads—if so, download in a browser and point `--zhvi` at the saved file.

Rebuild or restart the server so `/api/features` picks up the new file (ZIP choropleth metrics use `data/zip-metrics-seed.geojson` at server startup).

## Ingest Redfin metro (example)

Redfin CSV layouts change over time; `scripts/ingest-redfin-metro.mjs` is a **starting point**. Provide a metro→coordinates TSV (`region_key`, `lat`, `lng`).

```bash
node scripts/ingest-redfin-metro.mjs --csv ./data/raw/redfin.csv --geo ./data/raw/metro_latlng.tsv --prop home_sales
```

## Railway

- **[`railway.toml`](railway.toml)** sets **`builder = "DOCKERFILE"`**, **`healthcheckPath = "/api/health"`**, and a **120s** healthcheck timeout so deploys wait for the app (and Census cold paths) before cutting traffic.
- **Port:** Railway sets **`PORT`** at runtime; the server uses `process.env.PORT` (see [`server/index.mjs`](server/index.mjs)). Do **not** set **`LISTEN_HOST=127.0.0.1`**—production already binds **`0.0.0.0`** so the platform can reach the container.
- **Dockerfile:** multi-stage build runs **`npm run build`**, then **`node server/index.mjs`**. The image includes a **`HEALTHCHECK`** against `/api/health` using the same `PORT`.
- **`.dockerignore`** excludes `data/cache`, `data/raw`, and `.env*` so local cache/secrets are not copied into the image.

No database is required; ship updated GeoJSON / tiles under `data/` with your deploy artifact (or mount a volume) if you prefer not to bake data into the image.

## License / attribution

- Basemap: [CARTO](https://carto.com/basemaps/) via MapLibre style URL (see app code).
- Zillow and Redfin are trademarks of their respective owners; this project is not affiliated with them.
- **Data you add:** follow each provider’s terms; this repo ships **only synthetic demo numbers** plus pointers to **public** research downloads — not proprietary datasets.
