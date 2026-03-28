import type { MetricDef } from "../types";

/** Must stay in sync with MapView `metricColorExpression` stops. */
export function legendGradientCss(unit: MetricDef["unit"]): string {
  if (unit === "percent") {
    return "linear-gradient(90deg, #1d4ed8 0%, #60a5fa 22%, #94a3b8 50%, #4ade80 78%, #15803d 100%)";
  }
  if (unit === "count") {
    return "linear-gradient(90deg, #0f172a 0%, #1e3a8a 25%, #3b82f6 50%, #5eead4 75%, #ecfdf5 100%)";
  }
  return "linear-gradient(90deg, #0f172a 0%, #1e3a8a 20%, #2563eb 45%, #2dd4bf 72%, #a7f3d0 100%)";
}
