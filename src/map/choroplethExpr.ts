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

function favorableDirection(metricId: string, perspective: "buyer" | "seller"): "high" | "low" {
  // Buyer-centric defaults:
  // - lower prices / slower market = favorable
  // - longer DOM = favorable
  const buyerFav: "high" | "low" =
    metricId === "days_on_market"
      ? "high"
      : metricId === "home_sales" || metricId === "home_sales_yoy"
        ? "low"
        : metricId === "zhvi" || metricId === "zhvi_yoy" || metricId === "zhvi_mom"
          ? "low"
          : "high";

  if (perspective === "buyer") return buyerFav;
  return buyerFav === "high" ? "low" : "high";
}

export function metricColorExpression(
  metricId: string,
  metric: MetricDef,
  min: number,
  max: number,
  salesYear: number | undefined,
  perspective: "buyer" | "seller" = "buyer",
): ExpressionSpecification {
  const pad = (max - min) * 0.05 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo || 1;
  const key = metricValueGetExpression(metricId, salesYear);

  const fav = favorableDirection(metricId, perspective);
  const q1 = lo + span * 0.25;
  const q2 = lo + span * 0.5;
  const q3 = lo + span * 0.75;

  const lowColor = fav === "low" ? "#16a34a" : "#dc2626"; // green if low favorable else red
  const midLow = fav === "low" ? "#86efac" : "#fca5a5";
  const mid = "#e5e7eb";
  const midHigh = fav === "low" ? "#fca5a5" : "#86efac";
  const highColor = fav === "low" ? "#dc2626" : "#16a34a";

  return [
    "interpolate",
    ["linear"],
    key,
    lo,
    lowColor,
    q1,
    midLow,
    q2,
    mid,
    q3,
    midHigh,
    hi,
    highColor,
  ];
}

export function fillColorExpression(
  metricId: string,
  metric: MetricDef,
  min: number,
  max: number,
  geography: GeographyMode,
  salesYear: number | undefined,
  perspective: "buyer" | "seller" = "buyer",
): ExpressionSpecification {
  const metricExpr = metricColorExpression(metricId, metric, min, max, salesYear, perspective);
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
