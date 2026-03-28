import type { GeographyMode, MetricDef } from "../types";
import "./sidebar.css";

type Preset = "all" | "cheapest" | "expensive" | "high_growth" | "cooling";

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
  preset: Preset;
  onPreset: (p: Preset) => void;
  perspective: PerspectiveMode;
  onPerspective: (p: PerspectiveMode) => void;
  metricDef: MetricDef | undefined;
};

export function Sidebar({
  geography,
  metrics,
  selectedMetric,
  onSelectMetric,
  preset,
  onPreset,
  perspective,
  onPerspective,
  metricDef,
}: Props) {
  const groups = [...new Set(metrics.map((m) => m.group))];

  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h2 className="sidebar-heading">Popular data</h2>
        <div className="filter-grid" style={{ marginBottom: 10 }}>
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
        <p className="sidebar-hint">
          Pick a metric to color regions. In <strong>Zip</strong> mode, every ZCTA on
          screen is loaded from Census when you pan/zoom; only ZIPs in your seed/ingest
          get metric colors. Values should come from your{" "}
          <a
            href="https://www.zillow.com/research/data/"
            target="_blank"
            rel="noreferrer"
          >
            Zillow Research
          </a>{" "}
          or{" "}
          <a href="https://www.redfin.com/news/data-center/" target="_blank" rel="noreferrer">
            Redfin Data Center
          </a>{" "}
          CSV exports (no scraping).
        </p>
        {geography === "zip" && (
          <p className="sidebar-hint sidebar-hint-secondary">
            <strong>ZCTA vs. USPS ZIP:</strong> The map uses Census{" "}
            <abbr title="ZIP Code Tabulation Area">ZCTA</abbr> polygons (approximate
            delivery areas), not USPS routing geometry. Some USPS ZIPs have no ZCTA.
            Only ZCTAs <em>intersecting your current map view</em> are loaded (with zoom
            and area limits) so the app stays fast—not every code in the country at once.
          </p>
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
                                className={`src-pill ${src === "zillow" ? "z" : "r"}`}
                                title={src === "zillow" ? "Zillow" : "Redfin"}
                              >
                                {src === "zillow" ? "Z" : "R"}
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
                            className={`src-pill ${m.source === "zillow" ? "z" : "r"}`}
                            title={m.source === "zillow" ? "Zillow" : "Redfin"}
                          >
                            {m.source === "zillow" ? "Z" : "R"}
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
        <h2 className="sidebar-heading">Filters</h2>
        <div className="filter-grid">
          <button
            type="button"
            className={preset === "cheapest" ? "filter-btn on" : "filter-btn"}
            onClick={() => onPreset("cheapest")}
          >
            Cheapest
          </button>
          <button
            type="button"
            className={preset === "expensive" ? "filter-btn on" : "filter-btn"}
            onClick={() => onPreset("expensive")}
          >
            Most expensive
          </button>
          <button
            type="button"
            className={preset === "high_growth" ? "filter-btn on" : "filter-btn"}
            onClick={() => onPreset("high_growth")}
          >
            High value growth
          </button>
          <button
            type="button"
            className={preset === "cooling" ? "filter-btn on" : "filter-btn"}
            onClick={() => onPreset("cooling")}
          >
            Cooling markets
          </button>
          <button type="button" className="filter-btn reset" onClick={() => onPreset("all")}>
            Reset
          </button>
        </div>
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
