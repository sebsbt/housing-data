/** Mirrors server `resolveHomeSalesForYear` for tooltips / client-side display. */
export function resolveHomeSalesForYear(
  props: Record<string, unknown>,
  year: number | undefined,
): number | null {
  const y = Number(year);
  if (!Number.isFinite(y)) {
    const d = props.home_sales;
    return d != null && d !== "" ? Number(d) : null;
  }
  const by = props.sales_by_year;
  if (by && typeof by === "object" && !Array.isArray(by)) {
    const v = (by as Record<string, unknown>)[String(y)];
    if (v != null && v !== "") return Number(v);
  }
  const flat = props[`home_sales_${y}`];
  if (flat != null && flat !== "") return Number(flat);
  const d = props.home_sales;
  return d != null && d !== "" ? Number(d) : null;
}
