-- 创建看板数据模型的表结构

-- 看板表
CREATE TABLE IF NOT EXISTS dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    layout JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 数据源表
CREATE TABLE IF NOT EXISTS datasources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('table', 'query')),
    db_id VARCHAR(200),
    table_name VARCHAR(200),
    sql TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 列定义表
CREATE TABLE IF NOT EXISTS columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('string', 'number', 'datetime')),
    role VARCHAR(20) NOT NULL CHECK (role IN ('dimension', 'metric', 'time', 'ohlc_open', 'ohlc_high', 'ohlc_low', 'ohlc_close')),
    description TEXT,
    is_filterable BOOLEAN DEFAULT TRUE,
    is_groupable BOOLEAN DEFAULT TRUE
);

-- 组件表
CREATE TABLE IF NOT EXISTS components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    datasource_id UUID REFERENCES datasources(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('line', 'bar', 'metric', 'text', 'candlestick', 'pie', 'scatter', 'custom')),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    position JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 价格数据表（增强版，支持OHLC）
CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT NOT NULL,
    date DATE NOT NULL,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume BIGINT,
    PRIMARY KEY (symbol, date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_prices_symbol ON prices(symbol);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date);
CREATE INDEX IF NOT EXISTS idx_components_dashboard ON components(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_columns_datasource ON columns(datasource_id);

-- 插入示例数据源
INSERT INTO datasources (id, name, type, db_id, table_name, description) 
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'Stock Prices Enhanced',
    'table',
    'default',
    'prices',
    'Enhanced stock price data with OHLC and volume'
) ON CONFLICT DO NOTHING;

-- 插入列定义
INSERT INTO columns (datasource_id, name, type, role, description) VALUES
    ('550e8400-e29b-41d4-a716-446655440000', 'symbol', 'string', 'dimension', 'Stock symbol'),
    ('550e8400-e29b-41d4-a716-446655440000', 'date', 'datetime', 'time', 'Trading date'),
    ('550e8400-e29b-41d4-a716-446655440000', 'open', 'number', 'ohlc_open', 'Opening price'),
    ('550e8400-e29b-41d4-a716-446655440000', 'high', 'number', 'ohlc_high', 'Highest price'),
    ('550e8400-e29b-41d4-a716-446655440000', 'low', 'number', 'ohlc_low', 'Lowest price'),
    ('550e8400-e29b-41d4-a716-446655440000', 'close', 'number', 'ohlc_close', 'Closing price'),
    ('550e8400-e29b-41d4-a716-446655440000', 'volume', 'number', 'metric', 'Trading volume')
ON CONFLICT DO NOTHING;
