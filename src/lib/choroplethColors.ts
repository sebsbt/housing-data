/** Must stay in sync with map/choroplethExpr buyer-favorability coloring. */
function favorableDirection(metricId: string, perspective: "buyer" | "seller"): "high" | "low" {
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

export function legendGradientCss(metricId: string, perspective: "buyer" | "seller" = "buyer"): string {
  const fav = favorableDirection(metricId, perspective);
  const low = fav === "low" ? "#16a34a" : "#dc2626";
  const midLow = fav === "low" ? "#86efac" : "#fca5a5";
  const mid = "#e5e7eb";
  const midHigh = fav === "low" ? "#fca5a5" : "#86efac";
  const high = fav === "low" ? "#dc2626" : "#16a34a";
  return `linear-gradient(90deg, ${low} 0%, ${midLow} 25%, ${mid} 50%, ${midHigh} 75%, ${high} 100%)`;
}
