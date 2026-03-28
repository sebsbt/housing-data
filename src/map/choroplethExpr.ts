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

type PaletteMode = "default" | "colorblind";

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
  paletteMode: PaletteMode = "default",
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

  // Palette sets: default red/green vs colorblind-safe blue/orange.
  const palette =
    paletteMode === "colorblind"
      ? {
          favorableLow: "#1d4ed8",
          favorableMid: "#93c5fd",
          unfavorableMid: "#fdba74",
          unfavorableHigh: "#c2410c",
        }
      : {
          favorableLow: "#00a63e",
          favorableMid: "#7fff7f",
          unfavorableMid: "#ff8a8a",
          unfavorableHigh: "#c40000",
        };

  const lowColor = fav === "low" ? palette.favorableLow : palette.unfavorableHigh;
  const midLow = fav === "low" ? palette.favorableMid : palette.unfavorableMid;
  const mid = "#f3f4f6";
  const midHigh = fav === "low" ? palette.unfavorableMid : palette.favorableMid;
  const highColor = fav === "low" ? palette.unfavorableHigh : palette.favorableLow;

  // Percent metrics are anchored at zero: white is always 0%.
  if (metric.unit === "percent") {
    const lo0 = Math.min(lo, 0);
    const hi0 = Math.max(hi, 0);
    return [
      "interpolate",
      ["linear"],
      key,
      lo0,
      lowColor,
      (lo0 + 0) / 2,
      midLow,
      0,
      "#ffffff",
      (0 + hi0) / 2,
      midHigh,
      hi0,
      highColor,
    ];
  }

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
  paletteMode: PaletteMode = "default",
): ExpressionSpecification {
  const metricExpr = metricColorExpression(metricId, metric, min, max, salesYear, perspective, paletteMode);
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
