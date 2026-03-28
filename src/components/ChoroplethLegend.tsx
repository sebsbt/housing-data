import { legendGradientCss } from "../lib/choroplethColors";
import { formatMetricValue } from "../lib/formatMetricValue";
import type { GeographyMode, MetricDef } from "../types";
import "./choropleth-legend.css";

type PerspectiveMode = "buyer" | "seller";

type Props = {
  metric: MetricDef;
  min: number;
  max: number;
  geography: GeographyMode;
  perspective?: PerspectiveMode;
  /** e.g. "Year 2023" for home sales scrubber */
  subtitle?: string;
};

/**
 * Tableau-style color legend: titled ramp, formatted low/high, optional "no data" swatch.
 */
export function ChoroplethLegend({ metric, min, max, geography, perspective = "buyer", subtitle }: Props) {
  const low = formatMetricValue(min, metric.unit);
  const high = formatMetricValue(max, metric.unit);
  const gradient = legendGradientCss(metric.id, perspective);

  const legendTitle =
    metric.familyLabel && metric.metricFamily
      ? `${metric.familyLabel} · ${metric.label}`
      : metric.label;

  return (
    <div className="choropleth-legend" aria-label={`Color legend for ${legendTitle}`}>
      <div className="choropleth-legend-title">
        {legendTitle}
        {subtitle ? (
          <span className="choropleth-legend-sub"> · {subtitle}</span>
        ) : null}
      </div>
      <div className="choropleth-legend-rail" style={{ background: gradient }} />
      <div className="choropleth-legend-ticks">
        <span>{low}</span>
        <span>{high}</span>
      </div>
      {geography === "zip" && (
        <div className="choropleth-legend-nodata">
          <span className="choropleth-legend-swatch" />
          <span>No metric in seed / ingest</span>
        </div>
      )}
      <p className="choropleth-legend-foot">
        {perspective} view · scale: <strong>mean ± 2σ</strong> (current view, non-missing values)
        {metric.unit === "percent" ? " · white = 0%" : ""}.
      </p>
    </div>
  );
}
