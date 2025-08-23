import os
import time
import psycopg2
import yfinance as yf
import pandas as pd
import requests
from pandas_datareader import data as pdr

DB_URL = os.getenv("DB_URL")

# Wait for db container to be ready with retries
max_db_attempts = int(os.getenv("DB_RETRY_ATTEMPTS", "20"))
retry_delay = float(os.getenv("DB_RETRY_DELAY_SEC", "2"))
conn = None
for attempt in range(1, max_db_attempts + 1):
    try:
        conn = psycopg2.connect(DB_URL)
        break
    except Exception as e:
        print(f"DB not ready (attempt {attempt}/{max_db_attempts}): {e}")
        time.sleep(retry_delay)

if conn is None:
    raise RuntimeError("Database connection failed after retries")

cur = conn.cursor()

# Create table - supports OHLC data
cur.execute("""
CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT,
    date DATE,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume BIGINT
);
""")

# Symbols to fetch
symbols = ["AAPL", "NVDA"]

# Prepare a requests session with a reasonable User-Agent to avoid some 403/HTML responses
session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
})

start_date = os.getenv("YF_START_DATE", "2024-01-01")
max_fetch_attempts = int(os.getenv("YF_RETRY_ATTEMPTS", "5"))
fetch_delay = float(os.getenv("YF_RETRY_DELAY_SEC", "2"))

# Collect rows to insert
data_to_insert: list[tuple] = []

for symbol in symbols:
    df_symbol = None
    last_err = None
    for attempt in range(1, max_fetch_attempts + 1):
        try:
            # Fetch one symbol at a time to avoid MultiIndex and reduce coupling
            df_symbol = yf.download(
                symbol,
                start=start_date,
                progress=False,
                threads=False,
                timeout=30,
                session=session,
            )
            if df_symbol is not None and not df_symbol.empty:
                break
            else:
                last_err = f"Empty dataframe returned for {symbol}"
        except Exception as e:
            last_err = str(e)
        print(f"yfinance fetch {symbol} (attempt {attempt}/{max_fetch_attempts}) failed: {last_err}")
        time.sleep(fetch_delay)

    # Fallback to Stooq via pandas-datareader if Yahoo fails
    if (df_symbol is None or df_symbol.empty):
        try:
            print(f"Trying fallback (stooq) for {symbol}")
            df_symbol = pdr.DataReader(symbol, 'stooq')
            # Stooq returns oldest->newest; ensure ascending by date
            df_symbol = df_symbol.sort_index()
            if start_date:
                df_symbol = df_symbol[df_symbol.index >= pd.to_datetime(start_date)]
        except Exception as e:
            last_err = f"stooq fallback failed: {e}"

    if df_symbol is None or df_symbol.empty:
        print(f"Warning: skipping {symbol} due to repeated fetch failures: {last_err}")
        continue

    # Normalize and collect rows
    try:
        # Ensure expected columns exist
        expected_cols = {"Open", "High", "Low", "Close", "Volume"}
        if not expected_cols.issubset(set(map(str, df_symbol.columns))):
            print(f"Warning: unexpected columns for {symbol}: {list(df_symbol.columns)}")
        for date, row in df_symbol.iterrows():
            try:
                open_price = row.get("Open") if not pd.isna(row.get("Open")) else None
                high_price = row.get("High") if not pd.isna(row.get("High")) else None
                low_price = row.get("Low") if not pd.isna(row.get("Low")) else None
                close_price = row.get("Close") if not pd.isna(row.get("Close")) else None
                vol_val = row.get("Volume") or row.get("Volume")
                volume = int(vol_val) if vol_val is not None and not pd.isna(vol_val) else None

                data_to_insert.append((
                    symbol,
                    date.date(),
                    float(open_price) if open_price is not None else None,
                    float(high_price) if high_price is not None else None,
                    float(low_price) if low_price is not None else None,
                    float(close_price) if close_price is not None else None,
                    volume,
                ))
            except Exception as e:
                print(f"Error processing row for {symbol} on {date}: {e}")
                continue
        print(f"Fetched {len(df_symbol)} rows for {symbol}")
    except Exception as e:
        print(f"Error normalizing data for {symbol}: {e}")
        continue

# Idempotent load: clear then insert
cur.execute("DELETE FROM prices;")

if data_to_insert:
    args_str = ", ".join(["(%s, %s, %s, %s, %s, %s, %s)"] * len(data_to_insert))
    # Bulk insert using executemany for safety on long lists
    cur.executemany(
        "INSERT INTO prices (symbol, date, open, high, low, close, volume) VALUES (%s, %s, %s, %s, %s, %s, %s);",
        data_to_insert,
    )
else:
    print("No data to insert into prices table")

conn.commit()
cur.close()
conn.close()

print(f"✅ Data loaded successfully into Postgres: {len(data_to_insert)} records")
