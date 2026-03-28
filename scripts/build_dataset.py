#!/usr/bin/env python3
from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
RAW.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)

# Public endpoints (may evolve over time)
ZILLOW_COUNTY_ZHVI_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    "County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)

REDFIN_COUNTY_TRACKER_URLS = [
    "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz",
    "https://redfin-public-data.s3-us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz",
]


def fetch(url: str, out_path: Path, timeout: int = 60) -> bool:
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        out_path.write_bytes(r.content)
        print(f"Downloaded: {url} -> {out_path}")
        return True
    except Exception as e:
        print(f"WARN: failed download {url}: {e}")
        return False


def pick_redfin_file() -> Optional[Path]:
    out = RAW / "redfin_county_market_tracker.tsv.gz"
    for u in REDFIN_COUNTY_TRACKER_URLS:
        if fetch(u, out):
            return out
    return None


def latest_month_columns(df: pd.DataFrame) -> list[str]:
    # Zillow monthly columns are YYYY-MM-DD style strings
    pat = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    cols = [c for c in df.columns if pat.match(str(c))]
    return sorted(cols)


def build_zillow(zillow_csv: Path) -> pd.DataFrame:
    z = pd.read_csv(zillow_csv)

    # core IDs
    keep = [
        "RegionID",
        "SizeRank",
        "RegionName",
        "RegionType",
        "StateName",
        "State",
        "CountyName",
        "Metro",
        "FIPS",
    ]
    base_cols = [c for c in keep if c in z.columns]

    months = latest_month_columns(z)
    if len(months) < 13:
        raise RuntimeError("Not enough monthly columns in Zillow file")

    latest = months[-1]
    prev_12 = months[-13]

    out = z[base_cols + [latest, prev_12]].copy()
    out = out.rename(columns={latest: "zhvi_latest", prev_12: "zhvi_12m_ago"})

    out["zhvi_yoy_pct"] = (out["zhvi_latest"] / out["zhvi_12m_ago"] - 1.0) * 100.0
    out["fips"] = out.get("FIPS", pd.Series(index=out.index, dtype="object")).astype(str).str.zfill(5)

    out = out[
        [
            *(c for c in ["RegionName", "State", "StateName", "CountyName", "Metro", "fips"] if c in out.columns),
            "zhvi_latest",
            "zhvi_12m_ago",
            "zhvi_yoy_pct",
        ]
    ]

    out = out.dropna(subset=["fips"]).drop_duplicates(subset=["fips"], keep="first")
    return out


def _find_col(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    lc = {c.lower(): c for c in df.columns}
    for cand in candidates:
        for k, v in lc.items():
            if cand in k:
                return v
    return None


def build_redfin(redfin_tsv_gz: Path) -> pd.DataFrame:
    r = pd.read_csv(redfin_tsv_gz, sep="\t", compression="gzip", low_memory=False)

    # Defensive matching because schema can move
    region_type_col = _find_col(r, ["region_type"])
    if region_type_col:
        r = r[r[region_type_col].astype(str).str.lower() == "county"]

    period_col = _find_col(r, ["period_end", "period_begin", "month"])
    fips_col = _find_col(r, ["fips"])
    median_price_col = _find_col(r, ["median_sale_price", "median_list_price"])
    homes_sold_col = _find_col(r, ["homes_sold", "sold_count"])
    inventory_col = _find_col(r, ["inventory", "active_listing_count"])
    dom_col = _find_col(r, ["median_days_on_market", "days_on_market"])

    if not fips_col:
        raise RuntimeError("Redfin file missing FIPS-like column")

    if period_col and period_col in r.columns:
        r[period_col] = pd.to_datetime(r[period_col], errors="coerce")
        r = r.sort_values(period_col)
        r = r.dropna(subset=[period_col])
        latest_period = r[period_col].max()
        r = r[r[period_col] == latest_period]

    cols = [c for c in [fips_col, median_price_col, homes_sold_col, inventory_col, dom_col] if c]
    out = r[cols].copy()
    out = out.rename(
        columns={
            fips_col: "fips",
            median_price_col: "redfin_median_price",
            homes_sold_col: "redfin_homes_sold",
            inventory_col: "redfin_inventory",
            dom_col: "redfin_days_on_market",
        }
    )

    out["fips"] = out["fips"].astype(str).str.extract(r"(\d+)", expand=False).fillna("").str.zfill(5)
    out = out[out["fips"].str.len() == 5]
    out = out.drop_duplicates(subset=["fips"], keep="first")
    return out


def main():
    zillow_csv = RAW / "zillow_county_zhvi.csv"
    if not zillow_csv.exists():
        ok = fetch(ZILLOW_COUNTY_ZHVI_URL, zillow_csv)
        if not ok:
            raise SystemExit("Failed to download Zillow dataset")

    redfin_file = pick_redfin_file()

    z = build_zillow(zillow_csv)
    print(f"Zillow counties: {len(z)}")

    if redfin_file and redfin_file.exists():
        try:
            r = build_redfin(redfin_file)
            print(f"Redfin counties: {len(r)}")
            merged = z.merge(r, on="fips", how="left")
        except Exception as e:
            print(f"WARN: Redfin parse failed, continuing Zillow-only: {e}")
            merged = z.copy()
    else:
        merged = z.copy()

    # Clean numeric
    num_cols = [
        "zhvi_latest",
        "zhvi_12m_ago",
        "zhvi_yoy_pct",
        "redfin_median_price",
        "redfin_homes_sold",
        "redfin_inventory",
        "redfin_days_on_market",
    ]
    for c in num_cols:
        if c in merged.columns:
            merged[c] = pd.to_numeric(merged[c], errors="coerce")

    merged = merged.sort_values([c for c in ["State", "CountyName"] if c in merged.columns])

    out_csv = PROCESSED / "county_metrics.csv"
    out_parquet = PROCESSED / "county_metrics.parquet"
    merged.to_csv(out_csv, index=False)
    merged.to_parquet(out_parquet, index=False)

    print(f"Wrote {out_csv}")
    print(f"Wrote {out_parquet}")


if __name__ == "__main__":
    main()
