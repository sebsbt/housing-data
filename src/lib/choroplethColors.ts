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
  const low = fav === "low" ? "#00a63e" : "#c40000";
  const midLow = fav === "low" ? "#7fff7f" : "#ff8a8a";
  const mid = "#f3f4f6";
  const midHigh = fav === "low" ? "#ff8a8a" : "#7fff7f";
  const high = fav === "low" ? "#c40000" : "#00a63e";
  return `linear-gradient(90deg, ${low} 0%, ${midLow} 25%, ${mid} 50%, ${midHigh} 75%, ${high} 100%)`;
}
