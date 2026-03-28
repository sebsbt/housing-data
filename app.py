#!/usr/bin/env python3
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

DATA = Path(__file__).resolve().parent / "data" / "processed" / "county_metrics.csv"
COUNTY_GEOJSON = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"

st.set_page_config(page_title="US Housing Map", layout="wide")
st.title("US Housing Map (Zillow + Redfin Public Data)")

if not DATA.exists():
    st.warning("Dataset not built yet. Run: `python scripts/build_dataset.py`")
    st.stop()


df = pd.read_csv(DATA, dtype={"fips": str})
df["fips"] = df["fips"].astype(str).str.zfill(5)

metric_candidates = {
    "Zillow Home Value Index": "zhvi_latest",
    "Zillow YoY %": "zhvi_yoy_pct",
    "Redfin Median Price": "redfin_median_price",
    "Redfin Homes Sold": "redfin_homes_sold",
    "Redfin Inventory": "redfin_inventory",
    "Redfin Days on Market": "redfin_days_on_market",
}
available_metrics = {k: v for k, v in metric_candidates.items() if v in df.columns}

c1, c2, c3 = st.columns(3)
metric_label = c1.selectbox("Metric", list(available_metrics.keys()))
metric = available_metrics[metric_label]
state_filter = c2.selectbox("State filter", ["All"] + sorted([s for s in df.get("State", pd.Series()).dropna().unique()]))
color_scale = c3.selectbox("Color scale", ["Viridis", "RdYlGn", "Plasma", "Cividis"])

plot_df = df.copy()
if state_filter != "All" and "State" in plot_df.columns:
    plot_df = plot_df[plot_df["State"] == state_filter]

plot_df = plot_df.dropna(subset=[metric, "fips"]) if metric in plot_df.columns else plot_df

if plot_df.empty:
    st.info("No rows available for this filter/metric.")
    st.stop()

fig = px.choropleth_map(
    plot_df,
    geojson=COUNTY_GEOJSON,
    locations="fips",
    color=metric,
    color_continuous_scale=color_scale,
    map_style="carto-positron",
    zoom=3,
    center={"lat": 37.8, "lon": -96},
    opacity=0.7,
    labels={metric: metric_label},
    hover_data={
        "CountyName": True,
        "State": True,
        "zhvi_latest": ":,.0f" if "zhvi_latest" in plot_df.columns else False,
        "zhvi_yoy_pct": ":.2f" if "zhvi_yoy_pct" in plot_df.columns else False,
        "redfin_median_price": ":,.0f" if "redfin_median_price" in plot_df.columns else False,
        "redfin_homes_sold": ":,.0f" if "redfin_homes_sold" in plot_df.columns else False,
        "redfin_inventory": ":,.0f" if "redfin_inventory" in plot_df.columns else False,
    },
)
fig.update_layout(height=720, margin={"r": 0, "t": 0, "l": 0, "b": 0})

st.plotly_chart(fig, use_container_width=True)

st.subheader("Top/Bottom counties")
left, right = st.columns(2)
show_cols = [c for c in ["CountyName", "State", "fips", metric] if c in plot_df.columns]
left.dataframe(plot_df[show_cols].sort_values(metric, ascending=False).head(25), use_container_width=True)
right.dataframe(plot_df[show_cols].sort_values(metric, ascending=True).head(25), use_container_width=True)

with st.expander("Raw sample"):
    st.dataframe(plot_df.head(200), use_container_width=True)
