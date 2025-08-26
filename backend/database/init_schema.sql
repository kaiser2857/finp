-- filepath: d:\fomc-viewer\backend\database\init_schema.sql
-- Backend-ready PostgreSQL init SQL matching backend/src/app/models.py
-- This script drops legacy/conflicting tables, then recreates the correct schema.
-- Requires Postgres. Safe for a fresh DB. If you already ran an incompatible init, this fixes it.

-- 1) Enable required extension (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- 2) Drop legacy/conflicting tables (dependents first)
DROP TABLE IF EXISTS components CASCADE;
DROP TABLE IF EXISTS column_defs CASCADE;
DROP TABLE IF EXISTS columns CASCADE;              -- legacy table name
DROP TABLE IF EXISTS datasources CASCADE;
DROP TABLE IF EXISTS dashboards CASCADE;
DROP TABLE IF EXISTS database_connections CASCADE;
DROP TABLE IF EXISTS query_cache CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS prices CASCADE;

-- 3) Create tables per ORM models

-- 3.1 database_connections
CREATE TABLE IF NOT EXISTS database_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    database_type VARCHAR(50) NOT NULL,
    host VARCHAR(255),
    port INTEGER,
    database_name VARCHAR(200),
    username VARCHAR(100),
    password VARCHAR(255),
    connection_params JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3.2 dashboards
CREATE TABLE IF NOT EXISTS dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    layout JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3.3 datasources
CREATE TABLE IF NOT EXISTS datasources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL, -- plain text, not enum
    database_connection_id UUID REFERENCES database_connections(id) ON DELETE SET NULL,
    table_name VARCHAR(200),
    sql TEXT,
    api_endpoint VARCHAR(500),
    file_path VARCHAR(500),
    description TEXT,
    configuration JSONB DEFAULT '{}'::jsonb,
    cache_timeout INTEGER DEFAULT 300,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3.4 column_defs (was legacy `columns`)
CREATE TABLE IF NOT EXISTS column_defs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL, -- plain text, not enum
    role VARCHAR(50) DEFAULT 'dimension',
    description TEXT,
    is_filterable BOOLEAN DEFAULT TRUE,
    is_groupable BOOLEAN DEFAULT TRUE,
    format_string VARCHAR(100),
    default_aggregation VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3.5 components
CREATE TABLE IF NOT EXISTS components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    datasource_id UUID REFERENCES datasources(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    component_type VARCHAR(50) NOT NULL, -- plain text, not enum
    config JSONB DEFAULT '{}'::jsonb,
    query_config JSONB DEFAULT '{}'::jsonb,
    x_position INTEGER DEFAULT 0,
    y_position INTEGER DEFAULT 0,
    width INTEGER DEFAULT 4,
    height INTEGER DEFAULT 4,
    order_index INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3.6 query_cache
CREATE TABLE IF NOT EXISTS query_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    query_sql TEXT NOT NULL,
    result_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

-- 3.7 audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    user_id VARCHAR(100),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3.8 prices (used by sample datasource)
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

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_components_dashboard ON components(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_components_datasource ON components(datasource_id);
CREATE INDEX IF NOT EXISTS idx_coldefs_datasource ON column_defs(datasource_id);
CREATE INDEX IF NOT EXISTS idx_prices_symbol ON prices(symbol);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date);

COMMIT;
