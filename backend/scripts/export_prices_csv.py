#!/usr/bin/env python3
"""
Export OHLCV daily prices to CSV (AAPL, NVDA by default) using yfinance, with stooq fallback.

Usage examples (PowerShell):
  # default symbols and start date, output to prices.csv in current dir
  python export_prices_csv.py

  # custom symbols and start date
  python export_prices_csv.py --symbols AAPL,NVDA,MSFT --start 2024-01-01 --out d:/tmp/prices.csv

This script does NOT require a database. You can run it on an online machine and
copy the CSV to the offline target, then import with psql.
"""

import argparse
import sys
from typing import List
import requests
import yfinance as yf
import pandas as pd
from pandas_datareader import data as pdr


def fetch_symbol(symbol: str, start: str, session: requests.Session) -> pd.DataFrame:
    last_err = None
    # Try yfinance first
    for attempt in range(1, 6):
        try:
            df = yf.download(
                symbol,
                start=start,
                progress=False,
                threads=False,
                timeout=30,
                session=session,
            )
            if df is not None and not df.empty:
                return df
            else:
                last_err = f"Empty dataframe returned for {symbol}"
        except Exception as e:
            last_err = str(e)
        print(f"yfinance fetch {symbol} (attempt {attempt}/5) failed: {last_err}")
    # Fallback to stooq
    try:
        print(f"Trying fallback (stooq) for {symbol}")
        df = pdr.DataReader(symbol, 'stooq')
        df = df.sort_index()  # ensure ascending
        if start:
            df = df[df.index >= pd.to_datetime(start)]
        return df
    except Exception as e:
        raise RuntimeError(f"stooq fallback failed for {symbol}: {e}")


def export(symbols: List[str], start: str, out_path: str) -> int:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    })

    rows = []
    for sym in symbols:
        try:
            df = fetch_symbol(sym, start, session)
        except Exception as e:
            print(f"Warning: skip {sym}: {e}")
            continue
        # Normalize rows
        expected_cols = {"Open", "High", "Low", "Close", "Volume"}
        if not expected_cols.issubset(set(map(str, df.columns))):
            print(f"Warning: unexpected columns for {sym}: {list(df.columns)}")
        for dt, r in df.iterrows():
            try:
                rows.append({
                    "symbol": sym,
                    "date": dt.date().isoformat(),
                    "open": float(r.get("Open")) if pd.notna(r.get("Open")) else None,
                    "high": float(r.get("High")) if pd.notna(r.get("High")) else None,
                    "low": float(r.get("Low")) if pd.notna(r.get("Low")) else None,
                    "close": float(r.get("Close")) if pd.notna(r.get("Close")) else None,
                    "volume": int(r.get("Volume")) if pd.notna(r.get("Volume")) else None,
                })
            except Exception as e:
                print(f"Row error {sym} {dt}: {e}")
                continue
        print(f"Fetched {len(df)} rows for {sym}")

    if not rows:
        print("No data fetched. Nothing to write.")
        return 0

    out_df = pd.DataFrame(rows, columns=["symbol", "date", "open", "high", "low", "close", "volume"])
    out_df.to_csv(out_path, index=False)
    print(f"Wrote {len(out_df)} rows to {out_path}")
    return len(out_df)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="AAPL,NVDA", help="Comma-separated symbols")
    ap.add_argument("--start", default="2024-01-01", help="Start date, e.g. 2024-01-01")
    ap.add_argument("--out", default="prices.csv", help="Output CSV path")
    args = ap.parse_args()

    syms = [s.strip() for s in args.symbols.split(",") if s.strip()]
    if not syms:
        print("No symbols specified")
        return 2

    try:
        count = export(syms, args.start, args.out)
    except Exception as e:
        print(f"Export failed: {e}")
        return 1
    return 0 if count > 0 else 3


if __name__ == "__main__":
    sys.exit(main())
