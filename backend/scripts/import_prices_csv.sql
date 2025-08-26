-- Usage in psql (connected to analytics):
--   \i d:/fomc-viewer/backend/scripts/import_prices_csv.sql
--   -- Optionally set a different file path
--   -- \set filepath 'd:/path/prices.csv'

-- Ensure table exists
CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT,
    date DATE,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume BIGINT
);

-- Default file path (psql variable)
\set filepath 'd:/fomc-viewer/backend/prices.csv'

-- Idempotent load: clear then import
TRUNCATE TABLE prices;
\copy prices(symbol, date, open, high, low, close, volume) FROM :'filepath' CSV HEADER;

-- Indexes (optional, safe to create if not exists)
CREATE INDEX IF NOT EXISTS idx_prices_symbol ON prices(symbol);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date);
