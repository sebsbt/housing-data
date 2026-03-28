export type GeoJSONPosition = number | GeoJSONPosition[];

export type GJGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] }
  | { type: "MultiPolygon"; coordinates: [number, number][][][] };

export type GJFeature = {
  type: "Feature";
  geometry: GJGeometry;
  properties: Record<string, unknown> | null;
};

export type FeatureCollection = {
  type: "FeatureCollection";
  features: GJFeature[];
};

export type MetricSource = "zillow" | "redfin";

export type MetricDef = {
  id: string;
  label: string;
  group: string;
  source: MetricSource;
  description: string;
  unit: "usd" | "percent" | "count" | "days";
  /** When set, sidebar shows one row + dropdown for all metrics sharing the same `metricFamily` id */
  metricFamily?: string;
  familyLabel?: string;
  familyOrder?: number;
};

export type GeographyMode = "zip" | "metro";

export type GeoFeatureProps = {
  region_type: "zip" | "metro";
  zip?: string;
  cbsa?: string;
  metro_name?: string;
  state: string;
  city?: string;
  /** Zillow-style typical home value (ZHVI family), USD */
  zhvi?: number | null;
  /** YoY % change in home value */
  zhvi_yoy?: number | null;
  /** MoM % change when present in ingest */
  zhvi_mom?: number | null;
  /** Redfin: homes sold, count (period per your Redfin file) */
  home_sales?: number | null;
  /** YoY % change in home sales (Redfin) */
  home_sales_yoy?: number | null;
  /** Median days on market if present in your ingest */
  days_on_market?: number | null;
  data_note?: string;
};
