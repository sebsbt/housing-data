import type { ExpressionSpecification } from "maplibre-gl";
import type { GeographyMode, MetricDef } from "../types";

const HOVER_FILL = "#fbbf24";

/** Value read for choropleth (supports year-specific home_sales columns in tiles). */
export function metricValueGetExpression(
  metricId: string,
  salesYear: number | undefined,
): ExpressionSpecification {
  if (metricId === "home_sales" && salesYear != null && Number.isFinite(salesYear)) {
    const k = `home_sales_${Math.round(salesYear)}`;
    return ["coalesce", ["to-number", ["get", k]], ["to-number", ["get", "home_sales"]], 0];
  }
  return ["to-number", ["get", metricId]];
}

export function metricColorExpression(
  metricId: string,
  metric: MetricDef,
  min: number,
  max: number,
  salesYear: number | undefined,
): ExpressionSpecification {
  const pad = (max - min) * 0.05 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo || 1;
  const key = metricValueGetExpression(metricId, salesYear);

  if (metric.unit === "percent") {
    const q1 = lo + span * 0.25;
    const mid = lo + span * 0.5;
    const q3 = lo + span * 0.75;
    return [
      "interpolate",
      ["linear"],
      key,
      lo,
      "#1d4ed8",
      q1,
      "#60a5fa",
      mid,
      "#94a3b8",
      q3,
      "#4ade80",
      hi,
      "#15803d",
    ];
  }

  if (metric.unit === "count") {
    const q1 = lo + span * 0.25;
    const q2 = lo + span * 0.5;
    const q3 = lo + span * 0.75;
    return [
      "interpolate",
      ["linear"],
      key,
      lo,
      "#0f172a",
      q1,
      "#1e3a8a",
      q2,
      "#3b82f6",
      q3,
      "#5eead4",
      hi,
      "#ecfdf5",
    ];
  }

  const q1 = lo + span * 0.25;
  const q2 = lo + span * 0.5;
  const q3 = lo + span * 0.75;
  return [
    "interpolate",
    ["linear"],
    key,
    lo,
    "#0f172a",
    q1,
    "#1e3a8a",
    q2,
    "#2563eb",
    q3,
    "#2dd4bf",
    hi,
    "#a7f3d0",
  ];
}

export function fillColorExpression(
  metricId: string,
  metric: MetricDef,
  min: number,
  max: number,
  geography: GeographyMode,
  salesYear: number | undefined,
): ExpressionSpecification {
  const metricExpr = metricColorExpression(metricId, metric, min, max, salesYear);
  if (geography === "zip") {
    return [
      "case",
      ["boolean", ["feature-state", "hover"], false],
      HOVER_FILL,
      ["==", ["get", "has_metric"], false],
      "#2f3d4d",
      metricExpr,
    ];
  }
  return [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    HOVER_FILL,
    metricExpr,
  ];
}
