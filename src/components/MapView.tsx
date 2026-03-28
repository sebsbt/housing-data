import maplibregl, { type Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useEffect, useRef } from "react";
import { fillColorExpression } from "../map/choroplethExpr";
import { formatMetricValue } from "../lib/formatMetricValue";
import { getNumericForSelectedMetric } from "../lib/featureMetricValue";
import type { FeatureCollection, GeographyMode, GJGeometry, MetricDef } from "../types";

const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const HOVER_LINE = "#fde68a";
const ZCTA_SOURCE_LAYER = "zcta";

const MIN_ZCTA_ZOOM = 7.75;
const ZCTA_DEBOUNCE_MS = 280;

// Keep ZIP outlines clearly visible on dark basemap while avoiding heavy overdraw at low zoom.
const ZIP_OUTLINE_MIN_ZOOM = 6.8;

let pmtilesProtocolRegistered = false;
function ensurePmtilesProtocol() {
  if (pmtilesProtocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesProtocolRegistered = true;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_FOCUS_ZCTA = "92128";

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function extendGeometry(bounds: maplibregl.LngLatBounds, g: GJGeometry) {
  if (g.type === "Point") {
    bounds.extend(g.coordinates as maplibregl.LngLatLike);
    return;
  }
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      bounds.extend(coords as [number, number]);
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(g.coordinates);
}

function boundsForCollection(fc: FeatureCollection): maplibregl.LngLatBounds | null {
  const b = new maplibregl.LngLatBounds();
  let n = 0;
  for (const f of fc.features) {
    extendGeometry(b, f.geometry);
    n++;
  }
  return n > 0 ? b : null;
}

function pmtilesUrl(): string {
  const o = window.location.origin;
  return `pmtiles://${o}/tiles/zcta.pmtiles`;
}

type Props = {
  geography: GeographyMode;
  /** Filtered features (presets); drives GeoJSON data or vector layer filter. */
  data: FeatureCollection;
  /** Full ZIP feature collection for initial bounds when using PMTiles. */
  zipBoundsFc?: FeatureCollection | null;
  metricId: string;
  metric: MetricDef;
  metricDomain: { min: number; max: number };
  salesYear?: number;
  /** When true, load `zcta.pmtiles` instead of `/api/zcta-viewport` GeoJSON. */
  zipUsePmtiles?: boolean;
  onZipViewportLoad?: (fc: FeatureCollection, hint: string | null) => void;
};

export function MapView({
  geography,
  data,
  zipBoundsFc,
  metricId,
  metric,
  metricDomain,
  salesYear,
  zipUsePmtiles = false,
  onZipViewportLoad,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const dataRef = useRef(data);
  const zipBoundsRef = useRef(zipBoundsFc);
  const metricRef = useRef({ metricId, metric, min: metricDomain.min, max: metricDomain.max });
  const salesYearRef = useRef(salesYear);
  const zipTilesRef = useRef(zipUsePmtiles);
  const reloadZipViewportRef = useRef<(() => void) | null>(null);
  const hoveredIdRef = useRef<string | number | null>(null);
  const geographyRef = useRef(geography);
  const syncMarketsLayersRef = useRef<(() => void) | null>(null);
  const onZipLoadRef = useRef(onZipViewportLoad);
  onZipLoadRef.current = onZipViewportLoad;
  salesYearRef.current = salesYear;
  zipTilesRef.current = zipUsePmtiles;
  geographyRef.current = geography;

  const promoteId = geography === "zip" ? "zip" : "cbsa";

  const { min, max } = metricDomain;

  dataRef.current = data;
  zipBoundsRef.current = zipBoundsFc;
  metricRef.current = { metricId, metric, min, max };

  syncMarketsLayersRef.current = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer("regions-fill")) return;

    const geo = geographyRef.current;
    const zipTiles = zipTilesRef.current;
    const fc = dataRef.current;
    const sy = salesYearRef.current;
    const { metricId: mid, metric: m, min: lo, max: hi } = metricRef.current;

    map.setPaintProperty(
      "regions-fill",
      "fill-color",
      fillColorExpression(mid, m, lo, hi, geo, sy),
    );

    if (zipTiles && geo === "zip") {
      const zips = fc.features
        .map((f) => String(f.properties?.zip ?? "").replace(/\D/g, "").padStart(5, "0"))
        .filter((z) => z.length === 5 && z !== "00000");
      if (zips.length === 0) {
        map.setFilter("regions-fill", ["boolean", false]);
        if (map.getLayer("regions-outline")) {
          map.setFilter("regions-outline", ["boolean", false]);
        }
        if (map.getLayer("regions-outline-casing")) {
          map.setFilter("regions-outline-casing", ["boolean", false]);
        }
      } else {
        const f: maplibregl.FilterSpecification = [
          "in",
          ["to-string", ["get", "zip"]],
          ["literal", zips],
        ];
        map.setFilter("regions-fill", f);
        if (map.getLayer("regions-outline")) {
          map.setFilter("regions-outline", f);
        }
        if (map.getLayer("regions-outline-casing")) {
          map.setFilter("regions-outline-casing", f);
        }
      }
      return;
    }

    const src = map.getSource("markets") as maplibregl.GeoJSONSource | undefined;
    if (!src || src.type !== "geojson") return;

    const prev = hoveredIdRef.current;
    if (prev != null) {
      try {
        map.setFeatureState({ source: "markets", id: prev }, { hover: false });
      } catch {
        /* id may no longer exist */
      }
      hoveredIdRef.current = null;
      map.getCanvas().style.cursor = "";
      map.getCanvas().removeAttribute("title");
    }

    src.setData(fc as never);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const useTiles = geography === "zip" && zipUsePmtiles;

    const initialZoom = geography === "zip" ? 9.2 : 3.4;
    const initialCenter: [number, number] =
      geography === "zip" ? [-117.076, 32.995] : [-98.35, 39.5];

    const map = new maplibregl.Map({
      container: el,
      style: DARK_STYLE,
      center: initialCenter,
      zoom: initialZoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const clearHover = () => {
      const hid = hoveredIdRef.current;
      if (hid != null) {
        try {
          map.setFeatureState({ source: "markets", id: hid }, { hover: false });
        } catch {
          /* ignore */
        }
        hoveredIdRef.current = null;
      }
      map.getCanvas().style.cursor = "";
      map.getCanvas().removeAttribute("title");
    };

    const emptyFc: FeatureCollection = { type: "FeatureCollection", features: [] };

    let zctaAbort: AbortController | undefined;

    const loadZctaViewport = async () => {
      if (geography !== "zip" || zipTilesRef.current) return;
      const z = map.getZoom();
      if (z < MIN_ZCTA_ZOOM) {
        onZipLoadRef.current?.(emptyFc, "zoom_in");
        return;
      }
      const b = map.getBounds();
      const west = b.getWest();
      const south = b.getSouth();
      const east = b.getEast();
      const north = b.getNorth();
      zctaAbort?.abort();
      const ac = new AbortController();
      zctaAbort = ac;
      try {
        const u = new URL("/api/zcta-viewport", window.location.origin);
        u.searchParams.set("west", String(west));
        u.searchParams.set("south", String(south));
        u.searchParams.set("east", String(east));
        u.searchParams.set("north", String(north));
        u.searchParams.set("zoom", String(z));
        const sy = salesYearRef.current;
        if (sy != null && Number.isFinite(sy)) {
          u.searchParams.set("year", String(Math.round(sy)));
        }
        const fetchViewport = () => fetch(u.toString(), { signal: ac.signal });
        let res = await fetchViewport();
        if (!res.ok && !ac.signal.aborted) {
          await new Promise((r) => setTimeout(r, 450));
          if (!ac.signal.aborted) res = await fetchViewport();
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          geojson: FeatureCollection;
          hint: string | null;
        };
        if (ac.signal.aborted) return;
        onZipLoadRef.current?.(body.geojson, body.hint ?? null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (e instanceof Error && e.name === "AbortError") return;
        if (!ac.signal.aborted) onZipLoadRef.current?.(emptyFc, "fetch_error");
      }
    };

    const debouncedZcta = debounce(() => {
      void loadZctaViewport();
    }, ZCTA_DEBOUNCE_MS);

    map.on("load", () => {
      const fc = dataRef.current;
      const { metricId: mid, metric: m, min: lo, max: hi } = metricRef.current;
      const sy = salesYearRef.current;

      if (useTiles) {
        ensurePmtilesProtocol();
        map.addSource("markets", {
          type: "vector",
          url: pmtilesUrl(),
          promoteId: { [ZCTA_SOURCE_LAYER]: "zip" },
        } as never);

        map.addLayer({
          id: "regions-fill",
          type: "fill",
          source: "markets",
          "source-layer": ZCTA_SOURCE_LAYER,
          paint: {
            "fill-color": fillColorExpression(mid, m, lo, hi, geography, sy),
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.82,
              [
                "any",
                ["==", ["get", "has_metric"], false],
                ["==", ["get", "has_metric"], 0],
              ],
              0.38,
              0.62,
            ],
          },
        });

        map.addLayer({
          id: "regions-outline-casing",
          type: "line",
          source: "markets",
          "source-layer": ZCTA_SOURCE_LAYER,
          minzoom: ZIP_OUTLINE_MIN_ZOOM,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "rgba(0,0,0,0.85)",
            "line-opacity": ["interpolate", ["linear"], ["zoom"], ZIP_OUTLINE_MIN_ZOOM, 0.45, 9, 0.6, 12, 0.7],
            "line-width": ["interpolate", ["linear"], ["zoom"], ZIP_OUTLINE_MIN_ZOOM, 1.8, 9, 2.2, 12, 2.8],
          },
        });

        map.addLayer({
          id: "regions-outline",
          type: "line",
          source: "markets",
          "source-layer": ZCTA_SOURCE_LAYER,
          minzoom: ZIP_OUTLINE_MIN_ZOOM,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              HOVER_LINE,
              "rgba(255,255,255,0.95)",
            ],
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              ZIP_OUTLINE_MIN_ZOOM,
              0.75,
              9,
              0.92,
              12,
              1,
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              2.8,
              ["interpolate", ["linear"], ["zoom"], ZIP_OUTLINE_MIN_ZOOM, 1.1, 9, 1.4, 12, 1.9],
            ],
          },
        });

        const bfc = zipBoundsRef.current;
        const bounds = bfc ? boundsForCollection(bfc) : null;
        if (bounds && !bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 72, duration: 0, maxZoom: 12 });
        } else {
          void (async () => {
            try {
              const r = await fetch(
                `/api/zip-extent?zip=${encodeURIComponent(DEFAULT_FOCUS_ZCTA)}`,
              );
              if (r.ok) {
                const ext = (await r.json()) as {
                  west: number;
                  south: number;
                  east: number;
                  north: number;
                };
                map.fitBounds(
                  [
                    [ext.west, ext.south],
                    [ext.east, ext.north],
                  ],
                  { padding: 88, maxZoom: 13.5, duration: 0 },
                );
              }
            } catch {
              /* keep default */
            }
          })();
        }

        reloadZipViewportRef.current = null;
      } else {
        map.addSource("markets", {
          type: "geojson",
          data: (geography === "zip" ? emptyFc : fc) as never,
          promoteId,
        });

        map.addLayer({
          id: "regions-fill",
          type: "fill",
          source: "markets",
          paint: {
            "fill-color": fillColorExpression(mid, m, lo, hi, geography, sy),
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.82,
              ["==", ["get", "has_metric"], false],
              0.38,
              0.62,
            ],
          },
        });

        map.addLayer({
          id: "regions-outline-casing",
          type: "line",
          source: "markets",
          minzoom: geography === "zip" ? ZIP_OUTLINE_MIN_ZOOM : 0,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": geography === "zip" ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.55)",
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              geography === "zip" ? ZIP_OUTLINE_MIN_ZOOM : 0,
              geography === "zip" ? 0.45 : 0.4,
              9,
              0.6,
              12,
              0.7,
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], geography === "zip" ? ZIP_OUTLINE_MIN_ZOOM : 0, 1.8, 9, 2.2, 12, 2.8],
          },
        });

        map.addLayer({
          id: "regions-outline",
          type: "line",
          source: "markets",
          minzoom: geography === "zip" ? ZIP_OUTLINE_MIN_ZOOM : 0,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              HOVER_LINE,
              geography === "zip" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)",
            ],
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              geography === "zip" ? ZIP_OUTLINE_MIN_ZOOM : 0,
              geography === "zip" ? 0.75 : 0.7,
              9,
              0.92,
              12,
              1,
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              2.8,
              ["interpolate", ["linear"], ["zoom"], geography === "zip" ? ZIP_OUTLINE_MIN_ZOOM : 0, 1.1, 9, 1.4, 12, 1.9],
            ],
          },
        });

        if (geography === "metro") {
          const bounds = boundsForCollection(fc);
          if (bounds && !bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 56, duration: 0, maxZoom: 7 });
          }
        } else {
          void (async () => {
            try {
              const r = await fetch(
                `/api/zip-extent?zip=${encodeURIComponent(DEFAULT_FOCUS_ZCTA)}`,
              );
              if (r.ok) {
                const ext = (await r.json()) as {
                  west: number;
                  south: number;
                  east: number;
                  north: number;
                };
                map.fitBounds(
                  [
                    [ext.west, ext.south],
                    [ext.east, ext.north],
                  ],
                  { padding: 88, maxZoom: 13.5, duration: 0 },
                );
              }
            } catch {
              /* keep initial center */
            }
            await loadZctaViewport();
            map.on("moveend", debouncedZcta);
          })();
        }

        reloadZipViewportRef.current = () => {
          void loadZctaViewport();
        };
      }

      map.on("mousemove", (e) => {
        const feats = map.queryRenderedFeatures(e.point, { layers: ["regions-fill"] });
        if (feats.length === 0) {
          clearHover();
          return;
        }
        const feat = feats[0]!;
        const id = feat.id;
        if (id === undefined || id === null) {
          clearHover();
          return;
        }
        if (hoveredIdRef.current !== null && hoveredIdRef.current !== id) {
          map.setFeatureState(
            { source: "markets", id: hoveredIdRef.current },
            { hover: false },
          );
        }
        hoveredIdRef.current = id;
        map.setFeatureState({ source: "markets", id }, { hover: true });
        map.getCanvas().style.cursor = "pointer";

        const p = (feat.properties ?? {}) as Record<string, unknown>;
        const { metricId: mid, metric: met } = metricRef.current;
        const sy = salesYearRef.current;
        const geo = geography;
        const num = getNumericForSelectedMetric(p, mid, geo, sy);
        const hasMetric = p.has_metric !== false;
        const place =
          geography === "metro"
            ? String(p.metro_name ?? p.city ?? p.cbsa ?? "Region")
            : String(p.zip ?? "ZIP");
        let tip = place;
        if (num != null && !Number.isNaN(num) && (geography === "metro" || hasMetric)) {
          tip = `${place} — ${met.label}: ${formatMetricValue(num, met.unit)}`;
        } else if (geography === "zip") {
          tip = hasMetric
            ? `${place} — No data for ${met.label} in this ZIP`
            : `${place} — No ${met.label.toLowerCase()} in seed/ingest`;
        }
        map.getCanvas().setAttribute("title", tip);
      });

      map.on("mouseout", clearHover);

      map.on("click", "regions-fill", (e) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        const p = f.properties as Record<string, unknown>;
        const isMetro = geography === "metro";
        const hasMetric = p.has_metric !== false;
        const { metricId: selId, metric: selMet } = metricRef.current;
        const sy = salesYearRef.current;
        const title = isMetro
          ? `${String(p.metro_name ?? p.city ?? "Metro")} (CBSA ${String(p.cbsa ?? "—")})`
          : `${String(p.zip ?? "—")}${p.city ? ` · ${String(p.city)}` : ""}${p.state ? `, ${String(p.state)}` : ""}`;
        const selNum = getNumericForSelectedMetric(p, selId, geography, sy);
        const heroOk = selNum != null && !Number.isNaN(selNum) && (isMetro || hasMetric);
        const heroVal = heroOk ? formatMetricValue(selNum, selMet.unit) : "—";
        const descShort =
          selMet.description.length > 240
            ? `${selMet.description.slice(0, 240)}…`
            : selMet.description;
        const zhvi = p.zhvi != null ? Number(p.zhvi) : null;
        const yoy = p.zhvi_yoy != null ? Number(p.zhvi_yoy) : null;
        const mom = p.zhvi_mom != null ? Number(p.zhvi_mom) : null;
        const salesDisplay = getNumericForSelectedMetric(p, "home_sales", geography, sy);
        const sales = salesDisplay != null ? salesDisplay : p.home_sales != null ? Number(p.home_sales) : null;
        const note = String(p.data_note ?? "");
        const noData = !hasMetric || (zhvi == null && yoy == null && sales == null);
        const hasValueData = zhvi != null || yoy != null || mom != null;
        const hasMarketData = sales != null || syoy != null || dom != null;
        const dom = p.days_on_market != null ? Number(p.days_on_market) : null;
        const syoy = p.home_sales_yoy != null ? Number(p.home_sales_yoy) : null;
        const html = `
          <div class="popup-inner">
            <div class="popup-title">${escapeHtml(title)}</div>
            <div class="popup-hero">
              <div class="popup-hero-kicker">Selected metric</div>
              <div class="popup-hero-label">${escapeHtml(selMet.label)}</div>
              <div class="popup-hero-value">${escapeHtml(heroVal)}</div>
              <p class="popup-hero-desc">${escapeHtml(descShort)}</p>
            </div>
            <div class="popup-section-label">All values for this area</div>
            <table class="popup-table">
              <tbody>
                <tr><th>Home value (USD)</th><td>${zhvi != null ? formatMetricValue(zhvi, "usd") : "—"}</td></tr>
                <tr><th>Value YoY</th><td>${yoy != null ? formatMetricValue(yoy, "percent") : "—"}</td></tr>
                <tr><th>Value MoM</th><td>${mom != null ? formatMetricValue(mom, "percent") : "—"}</td></tr>
                <tr><th>Home sales</th><td>${sales != null ? formatMetricValue(sales, "count") : "—"}</td></tr>
                <tr><th>Sales YoY</th><td>${syoy != null ? formatMetricValue(syoy, "percent") : "—"}</td></tr>
                <tr><th>Days on market</th><td>${dom != null ? formatMetricValue(dom, "days") : "—"}</td></tr>
              </tbody>
            </table>
            <p class="popup-note">${noData ? "No metrics for this area — add it to your seed or ingest." : ""}${note.includes("DEMO") || note.includes("demo") ? " Demo seed where available." : ""}</p>
            <p class="popup-note">Value data: ${hasValueData ? "available" : "missing"} · Market activity data: ${hasMarketData ? "available" : "missing"}</p>
          </div>
        `;
        new maplibregl.Popup({ maxWidth: "320px" })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      });

      syncMarketsLayersRef.current?.();
    });

    return () => {
      reloadZipViewportRef.current = null;
      zctaAbort?.abort();
      clearHover();
      map.remove();
      mapRef.current = null;
    };
  }, [geography, promoteId, zipUsePmtiles]);

  useEffect(() => {
    if (geography !== "zip" || zipUsePmtiles) return;
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    reloadZipViewportRef.current?.();
  }, [salesYear, geography, zipUsePmtiles]);

  useEffect(() => {
    syncMarketsLayersRef.current?.();
  }, [data, metricId, metric, min, max, geography, salesYear, zipUsePmtiles]);

  return <div ref={containerRef} className="map-canvas" />;
}
