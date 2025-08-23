from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from uuid import UUID
from enum import Enum

# Enums
class DatasourceTypeEnum(str, Enum):
    TABLE = "table"
    QUERY = "query"
    API = "api"
    FILE = "file"

class ColumnTypeEnum(str, Enum):
    STRING = "string"
    NUMBER = "number"
    DATETIME = "datetime"
    BOOLEAN = "boolean"

class ColumnRoleEnum(str, Enum):
    DIMENSION = "dimension"
    METRIC = "metric"
    TIME = "time"
    OHLC_OPEN = "ohlc_open"
    OHLC_HIGH = "ohlc_high"
    OHLC_LOW = "ohlc_low"
    OHLC_CLOSE = "ohlc_close"
    FILTER = "filter"

class ComponentTypeEnum(str, Enum):
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

# Database Connection schemas
class DatabaseConnectionCreate(BaseModel):
    name: str = Field(..., max_length=200)
    database_type: str = Field(..., max_length=50)
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    connection_params: Optional[Dict[str, Any]] = {}

class DatabaseConnectionUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    database_type: Optional[str] = Field(None, max_length=50)
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    connection_params: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class DatabaseConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    name: str
    database_type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    # password 不返回，出于安全考虑
    connection_params: Dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime

# Dashboard schemas
class DashboardCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    layout: Optional[Dict[str, Any]] = {}

class DashboardUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    layout: Optional[Dict[str, Any]] = None

class DashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    name: str
    description: Optional[str]
    layout: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

# Column Definition schemas
class ColumnDefCreate(BaseModel):
    name: str = Field(..., max_length=200)
    type: ColumnTypeEnum
    role: ColumnRoleEnum = ColumnRoleEnum.DIMENSION
    description: Optional[str] = None
    is_filterable: bool = True
    is_groupable: bool = True
    format_string: Optional[str] = None
    default_aggregation: Optional[str] = None

class ColumnDefUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    type: Optional[ColumnTypeEnum] = None
    role: Optional[ColumnRoleEnum] = None
    description: Optional[str] = None
    is_filterable: Optional[bool] = None
    is_groupable: Optional[bool] = None
    format_string: Optional[str] = None
    default_aggregation: Optional[str] = None

class ColumnDefResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    name: str
    # Accept either our enum or plain string values to tolerate legacy rows
    type: Union[ColumnTypeEnum, str]
    role: Union[ColumnRoleEnum, str]
    description: Optional[str]
    is_filterable: bool
    is_groupable: bool
    format_string: Optional[str]
    default_aggregation: Optional[str]
    created_at: datetime

class DatasourceCreate(BaseModel):
    name: str = Field(..., max_length=200)
    type: str  # "table", "query"
    db_id: Optional[str] = "default"
    table_name: Optional[str] = None
    sql: Optional[str] = None
    description: Optional[str] = None
    columns: List[ColumnDefCreate] = []

class DatasourceUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    table_name: Optional[str] = None
    sql: Optional[str] = None

class DatasourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    type: str
    db_id: Optional[str]
    table_name: Optional[str]
    sql: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    columns: List[ColumnDefResponse] = []

# Datasource schemas (Enhanced)
class DatasourceCreateEnhanced(BaseModel):
    name: str = Field(..., max_length=200)
    type: DatasourceTypeEnum
    database_connection_id: Optional[UUID] = None
    table_name: Optional[str] = None
    sql: Optional[str] = None
    api_endpoint: Optional[str] = None
    file_path: Optional[str] = None
    description: Optional[str] = None
    configuration: Optional[Dict[str, Any]] = {}
    cache_timeout: Optional[int] = 300
    columns: List[ColumnDefCreate] = []

class DatasourceUpdateEnhanced(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    table_name: Optional[str] = None
    sql: Optional[str] = None
    api_endpoint: Optional[str] = None
    file_path: Optional[str] = None
    configuration: Optional[Dict[str, Any]] = None
    cache_timeout: Optional[int] = None
    is_active: Optional[bool] = None

class DatasourceResponseEnhanced(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    name: str
    # Accept either enum or string
    type: Union[DatasourceTypeEnum, str]
    database_connection_id: Optional[UUID]
    table_name: Optional[str]
    sql: Optional[str]
    api_endpoint: Optional[str]
    file_path: Optional[str]
    description: Optional[str]
    # Allow NULL in DB and coerce to default-friendly Optional
    configuration: Optional[Dict[str, Any]] = {}
    cache_timeout: Optional[int] = 300
    is_active: Optional[bool] = True
    created_at: datetime
    updated_at: datetime
    columns: List[ColumnDefResponse] = []

# Component schemas
class ComponentCreate(BaseModel):
    dashboard_id: UUID
    datasource_id: Optional[UUID] = None
    type: str  # "line", "bar", "metric", "text", "candlestick", etc.
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    position: Optional[Dict[str, Any]] = {}
    config: Optional[Dict[str, Any]] = {}

class ComponentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    datasource_id: Optional[UUID] = None
    position: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None

class ComponentResponse(BaseModel):
    id: UUID
    dashboard_id: UUID
    datasource_id: Optional[UUID]
    type: str
    name: str
    description: Optional[str]
    position: Dict[str, Any]
    config: Dict[str, Any]
    is_enabled: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Component schemas (Enhanced)
class ComponentCreateEnhanced(BaseModel):
    dashboard_id: UUID
    datasource_id: Optional[UUID] = None
    name: str = Field(..., max_length=200)
    component_type: ComponentTypeEnum
    # config: front-end owned; document multi-series contract in example
    config: Optional[Dict[str, Any]] = Field(default_factory=dict, json_schema_extra={
        "example": {
            "encoding": {
                "x": "date",
                "series": [
                    {"y": "close", "label": "Close", "color": "#1f77b4"},
                    {"y": "open", "label": "Open", "color": "#ff7f0e"}
                ]
            },
            "mark": "line",
            "options": {"stacked": False}
        }
    })
    query_config: Optional[Dict[str, Any]] = {}
    x_position: int = 0
    y_position: int = 0
    width: int = 4
    height: int = 4
    order_index: int = 0

class ComponentUpdateEnhanced(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    datasource_id: Optional[UUID] = None
    component_type: Optional[ComponentTypeEnum] = None
    config: Optional[Dict[str, Any]] = Field(default=None, json_schema_extra={
        "example": {
            "encoding": {
                "x": "symbol",
                "series": [
                    {"y": "avg_close", "label": "Avg Close"}
                ]
            },
            "mark": "bar",
            "options": {"stacked": True}
        }
    })
    query_config: Optional[Dict[str, Any]] = None
    x_position: Optional[int] = None
    y_position: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None

class ComponentResponseEnhanced(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    dashboard_id: UUID
    datasource_id: Optional[UUID]
    name: str
    # Allow enum or string for tolerance
    component_type: Union[ComponentTypeEnum, str]
    config: Dict[str, Any]
    query_config: Dict[str, Any]
    x_position: int
    y_position: int
    width: int
    height: int
    order_index: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

# New: layout update payloads
class ComponentLayoutUpdateItem(BaseModel):
    component_id: UUID
    x_position: Optional[int] = None
    y_position: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    order_index: Optional[int] = None
    # 新增：相对宽度（0-1），用于前端自适应布局
    width_ratio: Optional[float] = None

class DashboardComponentsLayoutUpdate(BaseModel):
    updates: List[ComponentLayoutUpdateItem]

# Query execution schemas
class QueryRequest(BaseModel):
    datasource_id: UUID
    sql: Optional[str] = None  # Override datasource SQL
    filters: Optional[List[Dict[str, Any]]] = []
    aggregations: Optional[List[Dict[str, Any]]] = []
    group_by: Optional[List[str]] = []
    order_by: Optional[List[Dict[str, str]]] = []
    limit: Optional[int] = 1000

# New: Component-level query request with all-optional fields (no datasource_id required)
class ComponentQueryRequest(BaseModel):
    sql: Optional[str] = None
    filters: Optional[List[Dict[str, Any]]] = []
    aggregations: Optional[List[Dict[str, Any]]] = []
    group_by: Optional[List[str]] = []
    order_by: Optional[List[Dict[str, str]]] = []
    limit: Optional[int] = 1000

class QueryResponse(BaseModel):
    data: List[Dict[str, Any]]
    columns: List[Dict[str, str]]
    row_count: int
    execution_time_ms: float
    cached: bool = False

# Chart context schema for MCP
class ChartContext(BaseModel):
    tables: List[Dict[str, Any]]
    
    @classmethod
    def from_datasource(cls, datasource, columns):
        """从数据源和列定义生成 ChartContext
        - 对于表型数据源，使用真实表名
        - 对于查询型数据源，使用虚拟表名 query_result，并附带 base_sql 以便工具侧通过 CTE 注入
        """
        is_table = datasource.type == "table" or getattr(datasource.type, 'value', None) == 'table'
        table_info = {
            "name": datasource.table_name if is_table else "query_result",
            "columns": [col.name for col in columns]
        }
        # 为 query 型数据源附带 base_sql，供 MCP db 工具在执行时注入 CTE
        if not is_table:
            base_sql = getattr(datasource, 'sql', None)
            if base_sql:
                table_info["base_sql"] = base_sql
        return cls(tables=[table_info])

# Enhanced agent request
class AgentRequest(BaseModel):
    question: str
    chartContext: Optional[Dict[str, Any]] = None
    component_id: Optional[UUID] = None  # 如果基于组件查询
    # 新增：允许前端指定提供商与模型（可选）
    provider: Optional[str] = None
    model: Optional[str] = None

# Component config examples for different chart types
class LineChartConfig(BaseModel):
    """折线图配置示例（多系列）"""
    encoding: Dict[str, Any] = Field(
        ..., 
        json_schema_extra={
            "example": {
                "x": "date",
                "series": [
                    {"y": "close", "label": "Close"},
                    {"y": "open", "label": "Open"}
                ]
            }
        }
    )
    mark: str = "line"
    options: Optional[Dict[str, Any]] = Field(
        default={}, 
        json_schema_extra={"example": {"smooth": True}}
    )

class CandlestickConfig(BaseModel):
    """K线图配置示例"""
    encoding: Dict[str, str] = Field(
        ...,
        json_schema_extra={
            "example": {
                "x": "date",
                "open": "open",
                "high": "high", 
                "low": "low",
                "close": "close"
            }
        }
    )
    mark: str = "candlestick"
    options: Optional[Dict[str, Any]] = Field(
        default={},
        json_schema_extra={
            "example": {
                "color": {"up": "#26a69a", "down": "#ef5350"}
            }
        }
    )

class MetricConfig(BaseModel):
    """指标卡配置示例"""
    encoding: Dict[str, str] = Field(
        ...,
        json_schema_extra={
            "example": {
                "value": "close",
                "filter": "symbol='NVDA'"
            }
        }
    )
    mark: str = "metric"
    options: Optional[Dict[str, Any]] = Field(
        default={},
        json_schema_extra={
            "example": {
                "agg": "last",
                "format": "${:,.2f}",
                "prefix": "Latest Price: "
            }
        }
    )

# Chart data request/response schemas for data visualization
class ChartDataRequest(BaseModel):
    datasource_id: UUID
    chart_type: ComponentTypeEnum
    filters: Optional[List[Dict[str, Any]]] = []
    aggregations: Optional[List[Dict[str, Any]]] = []
    group_by: Optional[List[str]] = []
    order_by: Optional[List[Dict[str, str]]] = []
    limit: Optional[int] = 1000
    time_range: Optional[Dict[str, Any]] = None

class ChartDataResponse(BaseModel):
    data: List[Dict[str, Any]]
    columns: List[Dict[str, str]]
    chart_config: Dict[str, Any]
    row_count: int
    execution_time_ms: float
    cached: bool = False
