import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from app.models import Base
from app.logger import log

# 加载环境变量
load_dotenv()

DATABASE_URL = os.getenv("DB_URL", "postgresql://rag:ragpwd@127.0.0.1:5432/analytics")

# 创建数据库引擎
engine = create_engine(DATABASE_URL, echo=False)  # 减少日志输出

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def _migrate_component_type_enum_to_text():
    """If components.component_type is a PostgreSQL ENUM, migrate it to TEXT and drop the enum type.
    This is a best-effort, idempotent migration for dev.
    """
    try:
        with engine.begin() as conn:
            # Detect Postgres and presence of column
            dialect = conn.dialect.name
            if dialect != "postgresql":
                return
            # Check column data type
            res = conn.execute(text(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_name='components' AND column_name='component_type'
                """
            )).fetchone()
            if not res:
                return
            data_type, udt_name = res[0], res[1]
            # If already text/varchar, nothing to do
            if data_type in ("text", "character varying", "varchar"):
                # Normalize values to lowercase for consistency
                conn.execute(text("UPDATE components SET component_type = LOWER(component_type) WHERE component_type IS NOT NULL"))
                return
            # If it's an enum, alter to text
            if data_type == "USER-DEFINED":
                log(f"Migrating components.component_type from ENUM {udt_name} to TEXT...")
                conn.execute(text("ALTER TABLE components ALTER COLUMN component_type TYPE TEXT USING component_type::text"))
                # Normalize values now that it's text
                conn.execute(text("UPDATE components SET component_type = LOWER(component_type) WHERE component_type IS NOT NULL"))
                # Try dropping enum type if exists and unused
                try:
                    conn.execute(text(f"DROP TYPE IF EXISTS {udt_name}"))
                except Exception as drop_err:
                    log(f"Could not drop enum type {udt_name}: {drop_err}")
                log("Migration of component_type to TEXT completed")
    except Exception as e:
        log(f"Component type enum->text migration skipped/failed: {e}")

def _migrate_datasource_type_enum_to_text():
    """If datasources.type is a PostgreSQL ENUM, migrate it to TEXT and drop the enum type.
    Idempotent and safe-ish for dev.
    """
    try:
        with engine.begin() as conn:
            dialect = conn.dialect.name
            if dialect != "postgresql":
                return
            res = conn.execute(text(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_name='datasources' AND column_name='type'
                """
            )).fetchone()
            if not res:
                return
            data_type, udt_name = res[0], res[1]
            if data_type in ("text", "character varying", "varchar"):
                # normalize values
                conn.execute(text("UPDATE datasources SET type = LOWER(type) WHERE type IS NOT NULL"))
                return
            if data_type == "USER-DEFINED":
                log(f"Migrating datasources.type from ENUM {udt_name} to TEXT...")
                conn.execute(text("ALTER TABLE datasources ALTER COLUMN type TYPE TEXT USING type::text"))
                conn.execute(text("UPDATE datasources SET type = LOWER(type) WHERE type IS NOT NULL"))
                try:
                    conn.execute(text(f"DROP TYPE IF EXISTS {udt_name}"))
                except Exception as drop_err:
                    log(f"Could not drop enum type {udt_name}: {drop_err}")
                log("Migration of datasources.type to TEXT completed")
    except Exception as e:
        log(f"Datasource type enum->text migration skipped/failed: {e}")

def _migrate_column_defs_enums_to_text():
    """Migrate column_defs.type and column_defs.role from ENUM to TEXT, idempotently."""
    try:
        with engine.begin() as conn:
            if conn.dialect.name != "postgresql":
                return
            # type column
            res = conn.execute(text(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_name='column_defs' AND column_name='type'
                """
            )).fetchone()
            if res:
                data_type, udt_name = res[0], res[1]
                if data_type == "USER-DEFINED":
                    log(f"Migrating column_defs.type from ENUM {udt_name} to TEXT...")
                    conn.execute(text("ALTER TABLE column_defs ALTER COLUMN type TYPE TEXT USING type::text"))
                    conn.execute(text("UPDATE column_defs SET type = LOWER(type) WHERE type IS NOT NULL"))
                    try:
                        conn.execute(text(f"DROP TYPE IF EXISTS {udt_name}"))
                    except Exception as drop_err:
                        log(f"Could not drop enum type {udt_name}: {drop_err}")
            # role column
            res = conn.execute(text(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_name='column_defs' AND column_name='role'
                """
            )).fetchone()
            if res:
                data_type, udt_name = res[0], res[1]
                if data_type == "USER-DEFINED":
                    log(f"Migrating column_defs.role from ENUM {udt_name} to TEXT...")
                    conn.execute(text("ALTER TABLE column_defs ALTER COLUMN role TYPE TEXT USING role::text"))
                    conn.execute(text("UPDATE column_defs SET role = LOWER(role) WHERE role IS NOT NULL"))
                    try:
                        conn.execute(text(f"DROP TYPE IF EXISTS {udt_name}"))
                    except Exception as drop_err:
                        log(f"Could not drop enum type {udt_name}: {drop_err}")
    except Exception as e:
        log(f"column_defs enums->text migration skipped/failed: {e}")

def create_tables():
    """创建所有表"""
    try:
        Base.metadata.create_all(bind=engine)
        # Run lightweight migration after ensuring tables exist
        _migrate_component_type_enum_to_text()
        _migrate_datasource_type_enum_to_text()
        _migrate_column_defs_enums_to_text()
        log("Database tables created successfully")
        return True
    except Exception as e:
        log(f"Error creating tables: {e}")
        log("Continuing without database table creation...")
        return False

def get_db() -> Session:
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_sample_data():
    """初始化示例数据，并建立‘数据表(数据源)’与‘数据库连接’的关联。
    该方法具备幂等性：已存在则跳过或补全缺失字段/记录。
    同时创建默认仪表板与基础组件，便于前端直接使用。"""
    from app.models import (
        Datasource, ColumnDef, DatasourceType, ColumnType, ColumnRole,
        DatabaseConnection, Dashboard, Component, ComponentType
    )
    from sqlalchemy.engine import make_url
    from sqlalchemy import and_
    
    db = SessionLocal()
    try:
        # 1) 确保存在一个默认数据库连接（优先按名称“Local Analytics”获取）
        default_conn = (
            db.query(DatabaseConnection)
            .filter(DatabaseConnection.name == "Local Analytics")
            .first()
        )
        if not default_conn:
            # 如不存在，则尝试根据 DB_URL 派生
            try:
                url = make_url(DATABASE_URL)
                backend = getattr(url, "get_backend_name", lambda: url.drivername.split("+")[0])()
                default_conn = DatabaseConnection(
                    name="Local Analytics",
                    database_type=backend,
                    host=url.host or "127.0.0.1",
                    port=url.port or 5432,
                    database_name=url.database or "analytics",
                    username=url.username or "rag",
                    password=url.password or "ragpwd",
                    connection_params={}
                )
                db.add(default_conn)
                db.flush()
                log("Default database connection created for sample data")
            except Exception as e:
                log(f"Failed to derive default DB connection from DB_URL: {e}")
                default_conn = DatabaseConnection(
                    name="Local Analytics",
                    database_type="postgresql",
                    host="127.0.0.1",
                    port=5432,
                    database_name="analytics",
                    username="rag",
                    password="ragpwd",
                    connection_params={}
                )
                db.add(default_conn)
                db.flush()
        
        # 2) 确保存在 ‘Stock Prices’ 数据源
        prices_ds = (
            db.query(Datasource)
            .filter(Datasource.name == "Stock Prices")
            .first()
        )
        if not prices_ds:
            prices_ds = Datasource(
                name="Stock Prices",
                type=DatasourceType.TABLE,
                database_connection_id=default_conn.id,
                table_name="prices",
                description="Historical stock price data"
            )
            db.add(prices_ds)
            db.flush()
            log("Created default 'Stock Prices' datasource")
        else:
            # 如已有，确保关联了数据库连接与表名
            if not prices_ds.database_connection_id:
                prices_ds.database_connection_id = default_conn.id
            if not prices_ds.table_name:
                prices_ds.table_name = "prices"
        
        # 2.1) 补全必要列定义（若缺失则创建）
        existing_cols = {c.name: c for c in prices_ds.columns}
        required_cols = [
            ("symbol", ColumnType.STRING, ColumnRole.DIMENSION, "Stock symbol (e.g., AAPL, NVDA)"),
            ("date", ColumnType.DATETIME, ColumnRole.TIME, "Trading date"),
            ("close", ColumnType.NUMBER, ColumnRole.METRIC, "Closing price"),
            ("open", ColumnType.NUMBER, ColumnRole.OHLC_OPEN, "Opening price"),
            ("high", ColumnType.NUMBER, ColumnRole.OHLC_HIGH, "Highest price"),
            ("low", ColumnType.NUMBER, ColumnRole.OHLC_LOW, "Lowest price"),
            ("volume", ColumnType.NUMBER, ColumnRole.METRIC, "Trading volume"),
        ]
        for name, ctype, role, desc in required_cols:
            if name not in existing_cols:
                db.add(ColumnDef(
                    datasource_id=prices_ds.id,
                    name=name,
                    type=ctype,
                    role=role,
                    description=desc
                ))
        
        # 3) 创建默认仪表板（如不存在）
        dashboard = (
            db.query(Dashboard)
            .filter(Dashboard.name == "Getting Started")
            .first()
        )
        dashboard_created = False
        if not dashboard:
            dashboard = Dashboard(
                name="Getting Started",
                description="Sample dashboard with default charts",
                layout={}
            )
            db.add(dashboard)
            db.flush()
            dashboard_created = True
            log("Created default 'Getting Started' dashboard")
        
        # 4) 创建基础组件：仅在首次创建仪表板时，或该仪表板当前没有任何组件时才进行
        seed_components = False
        if dashboard_created:
            seed_components = True
        else:
            try:
                existing_count = db.query(Component).filter(Component.dashboard_id == dashboard.id).count()
                seed_components = (existing_count == 0)
            except Exception:
                seed_components = False
        
        if seed_components:
            def ensure_component(name: str, ctype: ComponentType, config: dict, query_config: dict):
                exists = (
                    db.query(Component)
                    .filter(and_(Component.dashboard_id == dashboard.id, Component.name == name))
                    .first()
                )
                if exists:
                    return exists
                comp = Component(
                    dashboard_id=dashboard.id,
                    datasource_id=prices_ds.id,
                    name=name,
                    component_type=ctype.value if hasattr(ctype, 'value') else str(ctype),
                    config=config or {},
                    query_config=query_config or {},
                    x_position=0,
                    y_position=0,
                    width=6,
                    height=4,
                    order_index=0
                )
                db.add(comp)
                return comp
            
            # 折线图：按日期查看收盘价
            ensure_component(
                name="Close Price - Line",
                ctype=ComponentType.LINE,
                config={
                    "encoding": {"x": "date", "y": "close", "color": "symbol"},
                    "mark": "line",
                    "options": {"smooth": True}
                },
                query_config={
                    "group_by": ["date", "symbol"],
                    "order_by": [{"column": "date", "direction": "ASC"}]
                }
            )
            
            # K线图
            ensure_component(
                name="Candlestick",
                ctype=ComponentType.CANDLESTICK,
                config={
                    "encoding": {"x": "date", "open": "open", "high": "high", "low": "low", "close": "close"},
                    "mark": "candlestick",
                    "options": {"color": {"up": "#26a69a", "down": "#ef5350"}}
                },
                query_config={
                    "group_by": ["date"],
                    "order_by": [{"column": "date", "direction": "ASC"}]
                }
            )
            
            # 指标卡：最新收盘价（以 NVDA 为例）
            ensure_component(
                name="Latest Close (Metric)",
                ctype=ComponentType.METRIC,
                config={
                    "encoding": {"value": "close"},
                    "mark": "metric",
                    "options": {"agg": "last", "format": "${:,.2f}", "prefix": "Latest Price: "}
                },
                query_config={
                    "filters": [{"column": "symbol", "operator": "=", "value": "NVDA"}],
                    "order_by": [{"column": "date", "direction": "DESC"}],
                    "limit": 1
                }
            )
        else:
            log("Skipping sample component seeding: dashboard exists and already has components")
        
        db.commit()
        log("Sample data ensured successfully (connections, datasource, columns, dashboard, components)")
        
    except Exception as e:
        db.rollback()
        log(f"Error initializing sample data: {e}")
        raise
    finally:
        db.close()
