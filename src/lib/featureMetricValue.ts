import type { GeographyMode, MetricDef } from "../types";
import { formatMetricValue } from "./formatMetricValue";
import { resolveHomeSalesForYear } from "./resolveHomeSalesForYear";

/**
 * Numeric value for the selected metric on a feature (popup / hover).
 * Respects year-specific home sales the same way as the server merge.
 */
export function getNumericForSelectedMetric(
  props: Record<string, unknown>,
  metricId: string,
  _geography: GeographyMode,
  salesYear?: number,
): number | null {
  if (metricId === "home_sales") {
    return resolveHomeSalesForYear(props, salesYear);
  }
  const raw = props[metricId];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function formatHoverLines(
  props: Record<string, unknown>,
  place: string,
  metricId: string,
  metricLabel: string,
  geography: GeographyMode,
  salesYear: number | undefined,
  unit: MetricDef["unit"],
): { title: string; subtitle: string | null } {
  const hasMetric = props.has_metric !== false;
  const num = getNumericForSelectedMetric(props, metricId, geography, salesYear);
  const hasValue = num != null && !Number.isNaN(num);

  if (hasValue && (geography === "metro" || hasMetric)) {
    return {
      title: place,
      subtitle: `${metricLabel}: ${formatMetricValue(num, unit)}`,
    };
  }
  if (geography === "zip") {
    if (hasMetric && !hasValue) {
      return {
        title: place,
        subtitle: `No data for ${metricLabel} in this ZIP`,
      };
    }
    return {
      title: place,
      subtitle: `No ${metricLabel.toLowerCase()} in seed/ingest`,
    };
  }
  return {
    title: place,
    subtitle: hasValue ? `${metricLabel}: ${formatMetricValue(num!, unit)}` : null,
  };
}
