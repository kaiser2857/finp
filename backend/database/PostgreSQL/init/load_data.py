import os
import time
import psycopg2
import yfinance as yf
import pandas as pd

DB_URL = os.getenv("DB_URL")

# 等待 db 容器准备好
time.sleep(10)

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# 建表 - 支持 OHLC 数据
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

# 拉取 AAPL/NVDA 股价（过去一年，包含 OHLC）
symbols = ["AAPL", "NVDA"]
df = yf.download(symbols, start="2024-01-01")

# 重新整理数据结构
data_to_insert = []
for symbol in symbols:
    for date, row in df.iterrows():
        # 处理多级列索引
        try:
            open_price = row[('Open', symbol)] if not pd.isna(row[('Open', symbol)]) else None
            high_price = row[('High', symbol)] if not pd.isna(row[('High', symbol)]) else None
            low_price = row[('Low', symbol)] if not pd.isna(row[('Low', symbol)]) else None
            close_price = row[('Close', symbol)] if not pd.isna(row[('Close', symbol)]) else None
            volume = int(row[('Volume', symbol)]) if not pd.isna(row[('Volume', symbol)]) else None
            
            data_to_insert.append((
                symbol,
                date.date(),
                float(open_price) if open_price is not None else None,
                float(high_price) if high_price is not None else None,
                float(low_price) if low_price is not None else None,
                float(close_price) if close_price is not None else None,
                volume
            ))
        except Exception as e:
            print(f"Error processing {symbol} on {date}: {e}")
            continue

# 插入数据（幂等，先清空再写）
cur.execute("DELETE FROM prices;")
for data in data_to_insert:
    cur.execute(
        "INSERT INTO prices (symbol, date, open, high, low, close, volume) VALUES (%s, %s, %s, %s, %s, %s, %s);",
        data
    )

conn.commit()
cur.close()
conn.close()

print(f"✅ Data loaded successfully into Postgres: {len(data_to_insert)} records")
