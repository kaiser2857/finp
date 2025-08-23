from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Enum, Integer, Float
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from datetime import datetime
import enum

Base = declarative_base()

class DatasourceType(enum.Enum):
    TABLE = "table"
    QUERY = "query"
    API = "api"
    FILE = "file"

class ColumnType(enum.Enum):
    STRING = "string"
    NUMBER = "number"
    DATETIME = "datetime"
    BOOLEAN = "boolean"

class ColumnRole(enum.Enum):
    DIMENSION = "dimension"
    METRIC = "metric"
    TIME = "time"
    OHLC_OPEN = "ohlc_open"
    OHLC_HIGH = "ohlc_high"
    OHLC_LOW = "ohlc_low"
    OHLC_CLOSE = "ohlc_close"
    FILTER = "filter"

class ComponentType(enum.Enum):
    LINE = "line"
    BAR = "bar"
    METRIC = "metric"
    TEXT = "text"
    CANDLESTICK = "candlestick"
    PIE = "pie"
    SCATTER = "scatter"
    AREA = "area"
    HISTOGRAM = "histogram"
    HEATMAP = "heatmap"
    TABLE = "table"
    CUSTOM = "custom"

class DatabaseConnection(Base):
    """数据库连接配置"""
    __tablename__ = "database_connections"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False, unique=True)
    database_type = Column(String(50), nullable=False)  # postgresql, mysql, sqlite, etc.
    host = Column(String(255))
    port = Column(Integer)
    database_name = Column(String(200))
    username = Column(String(100))
    password = Column(String(255))  # 应该加密存储
    connection_params = Column(JSONB, default={})  # 额外的连接参数
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    datasources = relationship("Datasource", back_populates="database_connection")

class Dashboard(Base):
    __tablename__ = "dashboards"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    layout = Column(JSONB, default={})  # 前端布局配置 (grid/row/col)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    components = relationship("Component", back_populates="dashboard", cascade="all, delete-orphan")

class Datasource(Base):
    """数据源定义"""
    __tablename__ = "datasources"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    # Store as plain string to avoid Postgres ENUM mismatches
    type = Column(String(50), nullable=False)
    database_connection_id = Column(UUID(as_uuid=True), ForeignKey("database_connections.id"))
    table_name = Column(String(200))  # for TABLE type
    sql = Column(Text)  # for QUERY type
    api_endpoint = Column(String(500))  # for API type
    file_path = Column(String(500))  # for FILE type
    description = Column(Text)
    configuration = Column(JSONB, default={})  # 数据源特定配置
    cache_timeout = Column(Integer, default=300)  # 缓存超时秒数
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    database_connection = relationship("DatabaseConnection", back_populates="datasources")
    columns = relationship("ColumnDef", back_populates="datasource", cascade="all, delete-orphan")
    components = relationship("Component", back_populates="datasource")

    # Backward-compat property for legacy schemas expecting `db_id`
    @property
    def db_id(self):
        return str(self.database_connection_id) if self.database_connection_id else None

class ColumnDef(Base):
    """列定义"""
    __tablename__ = "column_defs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    datasource_id = Column(UUID(as_uuid=True), ForeignKey("datasources.id"), nullable=False)
    name = Column(String(200), nullable=False)
    # Store as plain string to avoid Postgres ENUM mismatches
    type = Column(String(50), nullable=False)
    role = Column(String(50), default="dimension")
    description = Column(Text)
    is_filterable = Column(Boolean, default=True)
    is_groupable = Column(Boolean, default=True)
    format_string = Column(String(100))  # 格式化字符串
    default_aggregation = Column(String(50))  # sum, avg, count, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    datasource = relationship("Datasource", back_populates="columns")

class Component(Base):
    """可视化组件"""
    __tablename__ = "components"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("dashboards.id"), nullable=False)
    datasource_id = Column(UUID(as_uuid=True), ForeignKey("datasources.id"))
    name = Column(String(200), nullable=False)
    # Store as plain string to avoid Postgres ENUM mismatches
    component_type = Column(String(50), nullable=False)
    config = Column(JSONB, default={})  # 组件配置 (图表类型，轴，颜色等)
    query_config = Column(JSONB, default={})  # 查询配置 (列选择，过滤器，分组等)
    x_position = Column(Integer, default=0)
    y_position = Column(Integer, default=0)
    width = Column(Integer, default=4)
    height = Column(Integer, default=4)
    order_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    dashboard = relationship("Dashboard", back_populates="components")
    datasource = relationship("Datasource", back_populates="components")

class QueryCache(Base):
    """查询结果缓存"""
    __tablename__ = "query_cache"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cache_key = Column(String(255), nullable=False, unique=True)
    query_sql = Column(Text, nullable=False)
    result_data = Column(JSONB)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    
class AuditLog(Base):
    """操作审计日志"""
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action = Column(String(100), nullable=False)  # create, update, delete, query
    resource_type = Column(String(50), nullable=False)  # dashboard, component, datasource
    resource_id = Column(UUID(as_uuid=True))
    user_id = Column(String(100))  # 将来可能需要用户认证
    details = Column(JSONB, default={})
    created_at = Column(DateTime, default=datetime.utcnow)

# 为了方便序列化，添加一些辅助方法

def to_dict(obj):
    """将 SQLAlchemy 对象转换为字典"""
    if obj is None:
        return None
    
    result = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            result[column.name] = value.isoformat()
        elif isinstance(value, uuid.UUID):
            result[column.name] = str(value)
        elif isinstance(value, enum.Enum):
            result[column.name] = value.value
        else:
            result[column.name] = value
    
    return result

# 为模型添加 to_dict 方法
Dashboard.to_dict = lambda self: to_dict(self)
Datasource.to_dict = lambda self: to_dict(self)
ColumnDef.to_dict = lambda self: to_dict(self)
Component.to_dict = lambda self: to_dict(self)
DatabaseConnection.to_dict = lambda self: to_dict(self)
QueryCache.to_dict = lambda self: to_dict(self)
AuditLog.to_dict = lambda self: to_dict(self)
