import type { MetricDef } from "../types";

/** Tableau-style compact labels on legends and in popups. */
export function formatMetricValue(value: number, unit: MetricDef["unit"]): string {
  switch (unit) {
    case "usd":
      if (!Number.isFinite(value)) return "—";
      if (Math.abs(value) >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(1)}M`;
      }
      if (Math.abs(value) >= 10_000) {
        return `$${Math.round(value / 1000)}K`;
      }
      return value.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
    case "percent":
      return `${value.toFixed(1)}%`;
    case "count":
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    case "days":
      return `${Math.round(value)}`;
    default:
      return String(value);
  }
}
