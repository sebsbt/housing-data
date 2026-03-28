# US Housing Map (Zillow + Redfin Public Data)

A lightweight Reventure-style map MVP using **public Zillow + Redfin datasets**.

## What this includes
- County-level US choropleth map
- Layer selector for key metrics (prices, YoY change, inventory/sales when available)
- Data pipeline from public sources:
  - Zillow Research CSVs (county-level)
  - Redfin public market tracker TSV (county-level)
- Single-command refresh

## Stack
- Python
- Streamlit (UI)
- Pandas
- Plotly mapbox choropleth

## Quickstart
```bash
cd /data/workspace/housing-map-app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Pull + build merged dataset
python scripts/build_dataset.py

# Run app
streamlit run app.py
```

## Notes on data licensing
This project uses publicly accessible endpoints from Zillow Research and Redfin public data pages/buckets. 
Before commercial usage, verify the current terms of use of each provider.

## Project structure
- `app.py` - Streamlit map app
- `scripts/build_dataset.py` - downloader + processor + merge
- `data/raw/` - downloaded source files
- `data/processed/` - merged county dataset

## Current MVP limitations
- County-level only (no ZIP/census tract yet)
- Redfin schema can change; parser uses defensive column matching
- No auth/paywall features yet

## Next upgrades
- Time slider and historical playback
- Composite opportunity score
- Saved views / watchlists
- API layer + background refresh jobs
