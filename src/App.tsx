import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, GeographyMode, MetricDef } from "./types";
import { ChoroplethLegend } from "./components/ChoroplethLegend";
import { MapView } from "./components/MapView";
import { SalesTimelineBar } from "./components/SalesTimelineBar";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import "./app-layout.css";
import { fetchWithRetry } from "./lib/fetchWithRetry";
import { resolveHomeSalesForYear } from "./lib/resolveHomeSalesForYear";

type FilterPreset = "all" | "cheapest" | "expensive" | "high_growth" | "cooling";
type PerspectiveMode = "buyer" | "seller";
type PaletteMode = "default" | "colorblind";

type ZipMetricRanges = Record<string, { min: number; max: number }>;

type SalesYearsResponse = {
  years: number[];
  defaultYear: number;
  min: number;
  max: number;
};

type AppConfig = {
  zipPmtiles: boolean;
  zipPmtilesUrl: string;
};

function domainForFeatures(
  fc: FeatureCollection | null,
  metricId: string,
  salesYear?: number,
): { min: number; max: number } {
  if (!fc || fc.features.length === 0) return { min: 0, max: 1 };
  const vals = fc.features
    .map((f) => {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      if (metricId === "home_sales") return resolveHomeSalesForYear(p, salesYear);
      const raw = p[metricId];
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return { min: 0, max: 1 };

  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const obsMin = Math.min(...vals);
  const obsMax = Math.max(...vals);
  if (!Number.isFinite(std) || std === 0) {
    return obsMin === obsMax
      ? { min: obsMin - 1, max: obsMax + 1 }
      : { min: obsMin, max: obsMax };
  }

  // Robust visual range: mean ± 2σ, clamped to observed bounds.
  let lo = mean - 2 * std;
  let hi = mean + 2 * std;
  lo = Math.max(lo, obsMin);
  hi = Math.min(hi, obsMax);

  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) {
    return obsMin === obsMax
      ? { min: obsMin - 1, max: obsMax + 1 }
      : { min: obsMin, max: obsMax };
  }

  return { min: lo, max: hi };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo);
}

function applyPreset(
  fc: FeatureCollection,
  preset: FilterPreset,
  valueKey: string,
): FeatureCollection {
  if (preset === "all") return fc;
  const nums = fc.features
    .map((f) => f.properties?.[valueKey])
    .filter((v) => v != null && !Number.isNaN(Number(v)))
    .map((v) => Number(v))
    .sort((a, b) => a - b);
  if (nums.length === 0) return fc;

  const p25 = percentile(nums, 0.25);
  const p75 = percentile(nums, 0.75);

  const keep = (v: unknown, mode: "low" | "high") => {
    if (v == null || Number.isNaN(Number(v))) return false;
    const n = Number(v);
    if (mode === "low") return n <= p25;
    return n >= p75;
  };

  if (preset === "cheapest" && valueKey === "zhvi") {
    return {
      ...fc,
      features: fc.features.filter((f) => keep(f.properties?.zhvi, "low")),
    };
  }
  if (preset === "expensive" && valueKey === "zhvi") {
    return {
      ...fc,
      features: fc.features.filter((f) => keep(f.properties?.zhvi, "high")),
    };
  }
  if (preset === "high_growth") {
    return {
      ...fc,
      features: fc.features.filter((f) => keep(f.properties?.zhvi_yoy, "high")),
    };
  }
  if (preset === "cooling") {
    return {
      ...fc,
      features: fc.features.filter((f) => keep(f.properties?.zhvi_yoy, "low")),
    };
  }
  return fc;
}

export default function App() {
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [rawFc, setRawFc] = useState<FeatureCollection | null>(null);
  const [zipMetricRanges, setZipMetricRanges] = useState<ZipMetricRanges | null>(null);
  const [zipMapHint, setZipMapHint] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>("zhvi");
  const [geography, setGeography] = useState<GeographyMode>("zip");
  const [preset, setPreset] = useState<FilterPreset>("all");
  const [tableOpen, setTableOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [perspective, setPerspective] = useState<PerspectiveMode>("buyer");
  const [salesYearsInfo, setSalesYearsInfo] = useState<SalesYearsResponse | null>(null);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [salesPlaying, setSalesPlaying] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [rangeMin, setRangeMin] = useState<number | null>(null);
  const [rangeMax, setRangeMax] = useState<number | null>(null);
  const [showHelperText, setShowHelperText] = useState(true);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("default");
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cRes = await fetchWithRetry("/api/config", {
          retries: 4,
          retryDelayMs: 400,
        });
        if (cRes.ok && !cancelled) {
          setAppConfig((await cRes.json()) as AppConfig);
        }
      } catch {
        if (!cancelled) setAppConfig({ zipPmtiles: false, zipPmtilesUrl: "/tiles/zcta.pmtiles" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mRes = await fetchWithRetry("/api/metrics", {
          retries: 6,
          retryDelayMs: 450,
        });
        if (!mRes.ok) {
          throw new Error(
            `/api/metrics returned ${mRes.status}. In dev use http://localhost:5173 with npm run dev (Vite proxies /api → 3001).`,
          );
        }
        const m = (await mRes.json()) as MetricDef[];
        if (cancelled) return;
        setMetrics(m);

        if (geography === "metro") {
          const fRes = await fetchWithRetry(
            `/api/features?geography=${encodeURIComponent(geography)}`,
            { retries: 4, retryDelayMs: 400 },
          );
          if (!fRes.ok) {
            throw new Error(
              `/api/features returned ${fRes.status}. Restart the API or run npm run dev from the project folder.`,
            );
          }
          const f = (await fRes.json()) as FeatureCollection;
          if (cancelled) return;
          setRawFc(f);
          setZipMetricRanges(null);
          setSalesYearsInfo(null);
          setSalesPlaying(false);
          setZipMapHint(null);
        } else {
          let sy: SalesYearsResponse = {
            years: [],
            defaultYear: new Date().getFullYear(),
            min: new Date().getFullYear(),
            max: new Date().getFullYear(),
          };
          try {
            const syRes = await fetchWithRetry("/api/sales-years", {
              retries: 3,
              retryDelayMs: 400,
            });
            if (syRes.ok) sy = (await syRes.json()) as SalesYearsResponse;
          } catch {
            /* keep fallback */
          }
          if (cancelled) return;
          setSalesYearsInfo(sy);
          const y0 = sy.years.length > 0 ? sy.defaultYear : new Date().getFullYear();
          setSelectedYear(y0);

          const zRes = await fetchWithRetry(
            `/api/zip-metric-ranges?year=${encodeURIComponent(String(y0))}`,
            { retries: 4, retryDelayMs: 400 },
          );
          if (!zRes.ok) {
            throw new Error(
              `/api/zip-metric-ranges returned ${zRes.status}. Another app may be using port 3001, or the server is an old build—stop it and run npm run dev again.`,
            );
          }
          const zr = (await zRes.json()) as ZipMetricRanges;
          if (cancelled) return;
          setZipMetricRanges(zr);

          const useTiles = appConfig?.zipPmtiles === true;
          if (useTiles) {
            const fRes = await fetchWithRetry(
              `/api/features?geography=${encodeURIComponent("zip")}`,
              { retries: 4, retryDelayMs: 400 },
            );
            if (!fRes.ok) {
              throw new Error(
                `/api/features (zip) returned ${fRes.status}. Run npm run build:regions and npm run build:pmtiles.`,
              );
            }
            const zipFc = (await fRes.json()) as FeatureCollection;
            if (cancelled) return;
            setRawFc(zipFc);
            setZipMapHint(null);
          } else {
            setRawFc({ type: "FeatureCollection", features: [] });
            setZipMapHint(null);
          }
        }
        if (!cancelled) setLoadError(null);
      } catch (e) {
        if (!cancelled) {
          const hint =
            e instanceof TypeError
              ? "Network error—Vite proxies /api to port 3001. Run `npm run dev` in the project folder (API + Vite), or `npm run dev:api` plus Vite in another terminal. Open http://127.0.0.1:5173 (not file://); on some systems use 127.0.0.1 instead of localhost. Single port: `npm run build` then `npm start`."
              : e instanceof Error
                ? e.message
                : "Unknown error";
          setLoadError(`Could not load map data. ${hint}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [geography, appConfig?.zipPmtiles]);

  useEffect(() => {
    setPreset("all");
  }, [geography]);

  useEffect(() => {
    if (geography !== "zip" || salesYearsInfo == null) return;
    let cancelled = false;
    (async () => {
      try {
        const zRes = await fetch(
          `/api/zip-metric-ranges?year=${encodeURIComponent(String(selectedYear))}`,
        );
        if (!zRes.ok) return;
        const zr = (await zRes.json()) as ZipMetricRanges;
        if (!cancelled) setZipMetricRanges(zr);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [geography, selectedYear, salesYearsInfo]);

  useEffect(() => {
    if (!salesPlaying || geography !== "zip" || !salesYearsInfo?.years.length) return;
    const { min, max } = salesYearsInfo;
    const id = window.setInterval(() => {
      setSelectedYear((y) => (y >= max ? min : y + 1));
    }, 1200);
    return () => window.clearInterval(id);
  }, [salesPlaying, geography, salesYearsInfo]);

  useEffect(() => {
    if (selectedMetric !== "home_sales") setSalesPlaying(false);
  }, [selectedMetric]);

  const presetFc = useMemo(() => {
    if (!rawFc) return null;
    const valueKey =
      preset === "cheapest" || preset === "expensive"
        ? "zhvi"
        : preset === "high_growth" || preset === "cooling"
          ? "zhvi_yoy"
          : selectedMetric;
    return applyPreset(rawFc, preset, valueKey);
  }, [rawFc, preset, selectedMetric]);

  const selectedMetricDef = useMemo(
    () => metrics.find((x) => x.id === selectedMetric),
    [metrics, selectedMetric],
  );

  const metricDomain = useMemo(
    () => domainForFeatures(presetFc, selectedMetric, selectedYear),
    [selectedMetric, selectedYear, presetFc],
  );

  useEffect(() => {
    setRangeMin(metricDomain.min);
    setRangeMax(metricDomain.max);
  }, [selectedMetric, geography, metricDomain.min, metricDomain.max]);

  const filteredFc = useMemo(() => {
    if (!presetFc) return null;
    if (rangeMin == null || rangeMax == null) return presetFc;
    const lo = Math.min(rangeMin, rangeMax);
    const hi = Math.max(rangeMin, rangeMax);
    return {
      ...presetFc,
      features: presetFc.features.filter((f) => {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        const v =
          selectedMetric === "home_sales"
            ? resolveHomeSalesForYear(p, selectedYear)
            : p[selectedMetric] != null && Number.isFinite(Number(p[selectedMetric]))
              ? Number(p[selectedMetric])
              : null;
        if (v == null) return false;
        return v >= lo && v <= hi;
      }),
    };
  }, [presetFc, selectedMetric, selectedYear, rangeMin, rangeMax]);

  const onZipViewportLoad = useCallback((fc: FeatureCollection, hint: string | null) => {
    setRawFc(fc);
    setZipMapHint(hint);
  }, []);

  const onSelectMetric = useCallback((id: string) => {
    setSelectedMetric(id);
    setPreset("all");
    // Force immediate full refresh on metric switch; domain effect will set new defaults.
    setRangeMin(null);
    setRangeMax(null);
  }, []);

  return (
    <div className="app-shell">
      <TopBar
        geography={geography}
        onGeographyChange={setGeography}
        tableOpen={tableOpen}
        onToggleTable={() => setTableOpen((v) => !v)}
        colorblindMode={paletteMode === "colorblind"}
        onToggleColorblindMode={() =>
          setPaletteMode((m) => (m === "colorblind" ? "default" : "colorblind"))
        }
        onOpenMobileControls={() => setMobileControlsOpen(true)}
      />
      <SalesTimelineBar
        visible={
          geography === "zip" &&
          selectedMetric === "home_sales" &&
          (salesYearsInfo?.years.length ?? 0) > 0
        }
        year={selectedYear}
        minYear={salesYearsInfo?.min ?? selectedYear}
        maxYear={salesYearsInfo?.max ?? selectedYear}
        playing={salesPlaying}
        onYearChange={(y) => {
          setSalesPlaying(false);
          setSelectedYear(y);
        }}
        onTogglePlay={() => setSalesPlaying((p) => !p)}
      />
      <div className="app-body">
        <Sidebar
          geography={geography}
          metrics={metrics}
          selectedMetric={selectedMetric}
          onSelectMetric={onSelectMetric}
          perspective={perspective}
          onPerspective={setPerspective}
          rangeDomain={metricDomain}
          rangeMin={rangeMin ?? metricDomain.min}
          rangeMax={rangeMax ?? metricDomain.max}
          onRangeMinChange={setRangeMin}
          onRangeMaxChange={setRangeMax}
          showHelperText={showHelperText}
          onShowHelperText={setShowHelperText}
          mobileOpen={mobileControlsOpen}
          onCloseMobile={() => setMobileControlsOpen(false)}
          metricDef={selectedMetricDef}
        />
        <main className="map-main">
          {loadError && <div className="banner-error">{loadError}</div>}
          {geography === "zip" &&
            appConfig?.zipPmtiles !== true &&
            zipMapHint === "zoom_in" && (
            <div className="banner-info">
              Zoom in further (about level 8+) to load every ZIP code area (ZCTA) in
              view from Census.
            </div>
          )}
          {geography === "zip" &&
            appConfig?.zipPmtiles !== true &&
            zipMapHint === "bbox_too_large" && (
            <div className="banner-info">
              Visible area is too large — zoom in to load ZIP boundaries for this view.
            </div>
          )}
          {geography === "zip" &&
            appConfig?.zipPmtiles !== true &&
            zipMapHint === "fetch_error" && (
            <div className="banner-error">
              Could not load ZIP boundaries. Check the API and network.
            </div>
          )}
          {rawFc !== null && selectedMetricDef ? (
            <>
              <MapView
                key={`${geography}-${appConfig?.zipPmtiles ? "pm" : "gj"}`}
                geography={geography}
                data={filteredFc ?? { type: "FeatureCollection", features: [] }}
                zipBoundsFc={
                  geography === "zip" && appConfig?.zipPmtiles ? rawFc ?? undefined : undefined
                }
                metricId={selectedMetric}
                metric={selectedMetricDef}
                metricDomain={metricDomain}
                salesYear={geography === "zip" ? selectedYear : undefined}
                perspective={perspective}
                selectedRegionId={selectedRegionId}
                paletteMode={paletteMode}
                zipUsePmtiles={geography === "zip" && appConfig?.zipPmtiles === true}
                onZipViewportLoad={
                  geography === "zip" && appConfig?.zipPmtiles !== true
                    ? onZipViewportLoad
                    : undefined
                }
              />
              <ChoroplethLegend
                metric={selectedMetricDef}
                min={metricDomain.min}
                max={metricDomain.max}
                geography={geography}
                perspective={perspective}
                paletteMode={paletteMode}
                subtitle={
                  geography === "zip" && selectedMetric === "home_sales"
                    ? `Year ${selectedYear}`
                    : undefined
                }
              />
            </>
          ) : (
            !loadError && <div className="map-loading">Loading map…</div>
          )}
          {tableOpen && filteredFc && (
            <TableDrawer
              geography={geography}
              data={filteredFc}
              metricId={selectedMetric}
              onSelectRow={(id) => setSelectedRegionId(String(id))}
              onClose={() => setTableOpen(false)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function TableDrawer({
  geography,
  data,
  metricId,
  onSelectRow,
  onClose,
}: {
  geography: GeographyMode;
  data: FeatureCollection;
  metricId: string;
  onSelectRow: (id: string) => void;
  onClose: () => void;
}) {
  const rows: (Record<string, unknown> & { key: string })[] = data.features.map(
    (f, i) => {
      const p = f.properties ?? {};
      const key = geography === "metro" ? String(p.cbsa ?? i) : String(p.zip ?? i);
      return { key, ...p };
    },
  );
  const isMetro = geography === "metro";

  const [sortKey, setSortKey] = useState<string>(isMetro ? "metro_name" : "zip");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);

  const onSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedRows = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = av != null && Number.isFinite(Number(av)) ? Number(av) : null;
      const bn = bv != null && Number.isFinite(Number(bv)) ? Number(bv) : null;
      let cmp = 0;
      if (an != null && bn != null) cmp = an - bn;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, sortDir, sortKey]);

  const SortTh = ({ label, keyName }: { label: string; keyName: string }) => (
    <th onClick={() => onSort(keyName)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {sortKey === keyName ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <div className="table-drawer">
      <div className="table-drawer-head">
        <span>Table view</span>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {isMetro ? (
                <>
                  <SortTh label="CBSA" keyName="cbsa" />
                  <SortTh label="Metro" keyName="metro_name" />
                </>
              ) : (
                <>
                  <SortTh label="ZIP" keyName="zip" />
                  <SortTh label="City" keyName="city" />
                  <SortTh label="ST" keyName="state" />
                </>
              )}
              <SortTh label="Home value" keyName="zhvi" />
              <SortTh label="YoY %" keyName="zhvi_yoy" />
              <SortTh label="MoM %" keyName="zhvi_mom" />
              <SortTh label="Sales" keyName="home_sales" />
              <SortTh label="Listings" keyName="listing_count" />
              <SortTh label="Sales YoY %" keyName="home_sales_yoy" />
              <SortTh label="DOM" keyName="days_on_market" />
              <SortTh label="Income" keyName="median_income" />
              <SortTh label="Rent" keyName="median_rent" />
              <SortTh label="Pop" keyName="population" />
              <SortTh label="P/I" keyName="price_to_income" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr
                key={r.key}
                className={activeRowKey === r.key ? "active-row" : ""}
                onClick={() => {
                  setActiveRowKey(r.key);
                  onSelectRow(String(isMetro ? (r.cbsa ?? r.key) : (r.zip ?? r.key)));
                }}
                style={{ cursor: "pointer" }}
              >
                {isMetro ? (
                  <>
                    <td>{String(r.cbsa ?? "—")}</td>
                    <td>{String(r.metro_name ?? r.city ?? "—")}</td>
                  </>
                ) : (
                  <>
                    <td>{String(r.zip ?? "—")}</td>
                    <td>{String(r.city ?? "—")}</td>
                    <td>{String(r.state ?? "—")}</td>
                  </>
                )}
                <td>{fmt(r.zhvi, "usd")}</td>
                <td>{fmt(r.zhvi_yoy, "percent")}</td>
                <td>{fmt(r.zhvi_mom, "percent")}</td>
                <td>{fmt(r.home_sales, "count")}</td>
                <td>{fmt((r.listing_count ?? r.active_listing_count) as unknown, "count")}</td>
                <td>{fmt(r.home_sales_yoy, "percent")}</td>
                <td>{fmt(r.days_on_market, "days")}</td>
                <td>{fmt(r.median_income, "usd")}</td>
                <td>{fmt(r.median_rent, "usd")}</td>
                <td>{fmt(r.population, "count")}</td>
                <td>{fmt(r.price_to_income, "count")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-foot">
        Click a column header to sort. Click again to invert order.
      </p>
    </div>
  );
}

function fmt(v: unknown, unit: "usd" | "percent" | "count" | "days") {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (unit === "usd") return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (unit === "percent") return `${n.toFixed(1)}%`;
  if (unit === "days") return `${Math.round(n)} d`;
  return `${Math.round(n)}`;
}
