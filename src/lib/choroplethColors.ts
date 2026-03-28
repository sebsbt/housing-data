/** Must stay in sync with map/choroplethExpr buyer-favorability coloring. */
function favorableDirection(metricId: string): "high" | "low" {
  if (metricId === "days_on_market") return "high";
  if (metricId === "home_sales" || metricId === "home_sales_yoy") return "low";
  if (metricId === "zhvi" || metricId === "zhvi_yoy" || metricId === "zhvi_mom") return "low";
  return "high";
}

export function legendGradientCss(metricId: string): string {
  const fav = favorableDirection(metricId);
  const low = fav === "low" ? "#16a34a" : "#dc2626";
  const midLow = fav === "low" ? "#86efac" : "#fca5a5";
  const mid = "#e5e7eb";
  const midHigh = fav === "low" ? "#fca5a5" : "#86efac";
  const high = fav === "low" ? "#dc2626" : "#16a34a";
  return `linear-gradient(90deg, ${low} 0%, ${midLow} 25%, ${mid} 50%, ${midHigh} 75%, ${high} 100%)`;
}
