const u = new URL(
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/query",
);
u.searchParams.set("where", "ZCTA5='92128'");
u.searchParams.set("returnExtentOnly", "true");
u.searchParams.set("returnGeometry", "false");
u.searchParams.set("outSR", "4326");
u.searchParams.set("f", "json");
const r = await fetch(u);
const j = await r.json();
console.log(JSON.stringify(j, null, 2));
