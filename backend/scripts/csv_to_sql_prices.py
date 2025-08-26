#!/usr/bin/env python3
"""
Convert a prices.csv (columns: symbol,date,open,high,low,close,volume)
into SQL suitable for psql: CREATE TABLE (if missing) + TRUNCATE (optional) + INSERT VALUES ... in batches.

Usage examples (PowerShell):
  # default input scripts/prices.csv -> scripts/prices.sql
  python scripts/csv_to_sql_prices.py

  # custom paths
  python scripts/csv_to_sql_prices.py --in d:/path/prices.csv --out d:/path/prices.sql --no-truncate --batch 1000

Then in psql (connected to analytics):
  \i d:/path/prices.sql
"""

import argparse
import csv
import os
import sys
from typing import Optional

CREATE_TABLE_SQL = (
    """
CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT,
    date DATE,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume BIGINT
);
"""
).strip()

BEGIN_SQL = "BEGIN;\n"
COMMIT_SQL = "\nCOMMIT;\n"
TRUNCATE_SQL = "TRUNCATE TABLE prices;\n"

COLUMNS = ["symbol", "date", "open", "high", "low", "close", "volume"]


def sql_quote_string(val: str) -> str:
    """Quote a string for SQL single-quoted literal."""
    return "'" + val.replace("'", "''") + "'"


def parse_numeric(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = s.strip()
    if s == "" or s.lower() == "null":
        return None
    # keep as-is; basic validation
    try:
        float(s)
        return s
    except Exception:
        return None


def parse_int(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = s.strip()
    if s == "" or s.lower() == "null":
        return None
    try:
        int(s)
        return s
    except Exception:
        return None


def row_to_values(row: dict) -> str:
    symbol = row.get("symbol", "").strip()
    date = row.get("date", "").strip()
    open_ = parse_numeric(row.get("open"))
    high = parse_numeric(row.get("high"))
    low = parse_numeric(row.get("low"))
    close = parse_numeric(row.get("close"))
    volume = parse_int(row.get("volume"))

    # required fields: symbol, date
    sym_sql = sql_quote_string(symbol) if symbol != "" else "NULL"
    date_sql = sql_quote_string(date) if date != "" else "NULL"

    def nn(x: Optional[str]) -> str:
        return x if x is not None else "NULL"

    return f"({sym_sql}, {date_sql}, {nn(open_)}, {nn(high)}, {nn(low)}, {nn(close)}, {nn(volume)})"


def convert(in_path: str, out_path: str, batch: int, truncate: bool) -> int:
    if not os.path.isfile(in_path):
        raise FileNotFoundError(f"Input CSV not found: {in_path}")

    total = 0
    with open(in_path, "r", encoding="utf-8", newline="") as fin, open(out_path, "w", encoding="utf-8", newline="") as fout:
        reader = csv.DictReader(fin)
        # Write header SQL
        fout.write(BEGIN_SQL)
        fout.write(CREATE_TABLE_SQL + "\n")
        if truncate:
            fout.write(TRUNCATE_SQL)

        batch_vals = []
        for row in reader:
            vals = row_to_values(row)
            batch_vals.append(vals)
            total += 1
            if len(batch_vals) >= batch:
                fout.write("INSERT INTO prices (symbol, date, open, high, low, close, volume) VALUES\n    ")
                fout.write(",\n    ".join(batch_vals))
                fout.write(";\n")
                batch_vals = []
        # flush remaining
        if batch_vals:
            fout.write("INSERT INTO prices (symbol, date, open, high, low, close, volume) VALUES\n    ")
            fout.write(",\n    ".join(batch_vals))
            fout.write(";\n")

        fout.write(COMMIT_SQL)

    return total


def main() -> int:
    ap = argparse.ArgumentParser()
    default_in = ".\prices.csv"
    default_out = ".\prices.sql"
    ap.add_argument("--in", dest="in_path", default=default_in, help="Input CSV path")
    ap.add_argument("--out", dest="out_path", default=default_out, help="Output SQL path")
    ap.add_argument("--batch", type=int, default=1000, help="Rows per INSERT batch")
    ap.add_argument("--no-truncate", action="store_true", help="Do not TRUNCATE the table before insert")
    args = ap.parse_args()

    try:
        count = convert(args.in_path, args.out_path, batch=args.batch, truncate=not args.no_truncate)
        print(f"Wrote INSERTs for {count} rows to {args.out_path}")
        return 0
    except Exception as e:
        print(f"Conversion failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
