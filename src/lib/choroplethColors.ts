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

export function legendGradientCss(
  metricId: string,
  perspective: "buyer" | "seller" = "buyer",
  paletteMode: "default" | "colorblind" = "default",
): string {
  const fav = favorableDirection(metricId, perspective);
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

  const low = fav === "low" ? palette.favorableLow : palette.unfavorableHigh;
  const midLow = fav === "low" ? palette.favorableMid : palette.unfavorableMid;
  const mid = "#f3f4f6";
  const midHigh = fav === "low" ? palette.unfavorableMid : palette.favorableMid;
  const high = fav === "low" ? palette.unfavorableHigh : palette.favorableLow;
  return `linear-gradient(90deg, ${low} 0%, ${midLow} 25%, ${mid} 50%, ${midHigh} 75%, ${high} 100%)`;
}
