-- 简化的表创建脚本
CREATE TABLE IF NOT EXISTS dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    layout JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS datasources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL,
    db_id VARCHAR(200),
    table_name VARCHAR(200),
    sql TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    datasource_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL,
    role VARCHAR(20) NOT NULL,
    description TEXT,
    is_filterable BOOLEAN DEFAULT TRUE,
    is_groupable BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL,
    datasource_id UUID,
    type VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    position JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
