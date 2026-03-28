import type { GeographyMode, MetricDef } from "../types";
import { formatMetricValue } from "../lib/formatMetricValue";
import "./sidebar.css";

function familyMembersInGroup(metrics: MetricDef[], group: string, familyId: string) {
  return metrics
    .filter((m) => m.group === group && m.metricFamily === familyId)
    .sort((a, b) => (a.familyOrder ?? 0) - (b.familyOrder ?? 0));
}

type PerspectiveMode = "buyer" | "seller";

type Props = {
  geography: GeographyMode;
  metrics: MetricDef[];
  selectedMetric: string;
  onSelectMetric: (id: string) => void;
  perspective: PerspectiveMode;
  onPerspective: (p: PerspectiveMode) => void;
  rangeDomain: { min: number; max: number };
  rangeMin: number;
  rangeMax: number;
  onRangeMinChange: (v: number) => void;
  onRangeMaxChange: (v: number) => void;
  showHelperText: boolean;
  onShowHelperText: (v: boolean) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  metricDef: MetricDef | undefined;
};

export function Sidebar({
  geography,
  metrics,
  selectedMetric,
  onSelectMetric,
  perspective,
  onPerspective,
  rangeDomain,
  rangeMin,
  rangeMax,
  onRangeMinChange,
  onRangeMaxChange,
  showHelperText,
  onShowHelperText,
  mobileOpen,
  onCloseMobile,
  metricDef,
}: Props) {
  const groups = [...new Set(metrics.map((m) => m.group))];

  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-mobile-head">
        <button type="button" className="btn-outline" onClick={onCloseMobile}>
          Close
        </button>
      </div>
      <section className="sidebar-section">
        <h2 className="sidebar-heading">Popular data</h2>
        <div className="filter-grid" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className={perspective === "buyer" ? "filter-btn on" : "filter-btn"}
            onClick={() => onPerspective("buyer")}
          >
            Buyer view
          </button>
          <button
            type="button"
            className={perspective === "seller" ? "filter-btn on" : "filter-btn"}
            onClick={() => onPerspective("seller")}
          >
            Seller view
          </button>
        </div>
        <p className="sidebar-hint" style={{ marginTop: 0 }}>
          Green = more favorable for {perspective === "buyer" ? "buyers" : "sellers"}; red = less favorable.
        </p>
        {showHelperText && (
          <>
            <p className="sidebar-hint">
              Pick a metric and use Buyer/Seller mode to color the map.
            </p>
            {geography === "zip" && (
              <p className="sidebar-hint sidebar-hint-secondary">
                ZIP mode uses Census ZCTA boundaries in the current view for speed.
              </p>
            )}
          </>
        )}
        <div className="metric-groups">
          {groups.map((g) => {
            const inGroup = metrics.filter((m) => m.group === g);
            const doneFamilies = new Set<string>();
            return (
              <div key={g} className="metric-group">
                <div className="metric-group-title">{g}</div>
                <ul className="metric-list">
                  {inGroup.map((m) => {
                    if (m.metricFamily) {
                      if (doneFamilies.has(m.metricFamily)) return null;
                      doneFamilies.add(m.metricFamily);
                      const members = familyMembersInGroup(metrics, g, m.metricFamily);
                      const famLabel = m.familyLabel ?? g;
                      const active = members.some((x) => x.id === selectedMetric);
                      const src = members[0]?.source ?? "zillow";
                      const currentId =
                        members.find((x) => x.id === selectedMetric)?.id ?? members[0]!.id;
                      return (
                        <li key={m.metricFamily} className="metric-family-li">
                          <div
                            className={`metric-split ${active ? "active" : "inactive"}`}
                            title={
                              active
                                ? undefined
                                : "Map is using another metric — pick a variant or click Home value."
                            }
                          >
                            <button
                              type="button"
                              className="metric-split-main"
                              onClick={() => onSelectMetric(currentId)}
                            >
                              <span className="metric-split-title">{famLabel}</span>
                              <span
                                className={`src-pill ${src === "zillow" ? "z" : src === "redfin" ? "r" : "c"}`}
                                title={src === "zillow" ? "Zillow" : src === "redfin" ? "Redfin" : "Census"}
                              >
                                {src === "zillow" ? "Z" : src === "redfin" ? "R" : "C"}
                              </span>
                            </button>
                            <div
                              className="metric-split-segments"
                              role="radiogroup"
                              aria-label={`${famLabel} measure`}
                            >
                              {members.map((mem) => {
                                const id = mem.id.toLowerCase();
                                const short =
                                  id.includes("_yoy") || id.includes("yoy")
                                    ? "YoY"
                                    : id.includes("_mom") || id.includes("mom")
                                      ? "MoM"
                                      : mem.unit === "usd"
                                        ? "$"
                                        : mem.unit === "count"
                                          ? "Lvl"
                                          : mem.unit === "days"
                                            ? "DOM"
                                            : mem.label.slice(0, 4);
                                const pressed = selectedMetric === mem.id;
                                return (
                                  <button
                                    key={mem.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={pressed}
                                    className={`metric-segment ${pressed ? "on" : ""}`}
                                    title={mem.label}
                                    onClick={() => onSelectMetric(mem.id)}
                                  >
                                    {short}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className={`metric-row ${selectedMetric === m.id ? "active" : ""}`}
                          onClick={() => onSelectMetric(m.id)}
                        >
                          <span>{m.label}</span>
                          <span
                            className={`src-pill ${m.source === "zillow" ? "z" : m.source === "redfin" ? "r" : "c"}`}
                            title={m.source === "zillow" ? "Zillow" : m.source === "redfin" ? "Redfin" : "Census"}
                          >
                            {m.source === "zillow" ? "Z" : m.source === "redfin" ? "R" : "C"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sidebar-section">
        <h2 className="sidebar-heading">Range</h2>
        <div className="range-box">
          <div className="range-values">
            <span>{formatMetricValue(Math.min(rangeMin, rangeMax), metricDef?.unit ?? "count")}</span>
            <span>{formatMetricValue(Math.max(rangeMin, rangeMax), metricDef?.unit ?? "count")}</span>
          </div>
          <div className={`range-dual ${perspective}`}>
            <input
              type="range"
              min={rangeDomain.min}
              max={rangeDomain.max}
              step={(rangeDomain.max - rangeDomain.min) / 200 || 1}
              value={Math.min(rangeMin, rangeMax)}
              onChange={(e) => onRangeMinChange(Number(e.target.value))}
            />
            <input
              type="range"
              min={rangeDomain.min}
              max={rangeDomain.max}
              step={(rangeDomain.max - rangeDomain.min) / 200 || 1}
              value={Math.max(rangeMin, rangeMax)}
              onChange={(e) => onRangeMaxChange(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="sidebar-section">
        <h2 className="sidebar-heading">Settings</h2>
        <label className="sidebar-hint" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={showHelperText}
            onChange={(e) => onShowHelperText(e.target.checked)}
          />
          Show helper text
        </label>
      </section>

      <section className="sidebar-section detail">
        <h2 className="sidebar-heading">Data point</h2>
        {metricDef ? (
          <>
            <div className="detail-title">{metricDef.label}</div>
            <p className="detail-body">{metricDef.description}</p>
            <p className="detail-meta">
              Source channel: <strong>{metricDef.source}</strong> · Unit:{" "}
              <strong>{metricDef.unit}</strong>
            </p>
          </>
        ) : (
          <p className="detail-body muted">Select a metric to see its definition.</p>
        )}
      </section>
    </aside>
  );
}
