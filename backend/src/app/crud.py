from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.models import Dashboard, Datasource, ColumnDef, Component, DatasourceType, ColumnType, ColumnRole
from app.schemas import (
    DashboardCreate, DashboardUpdate,
    DatasourceCreate, DatasourceUpdate, ColumnDefCreate,
    ComponentCreate, ComponentUpdate
)

# Dashboard CRUD
def create_dashboard(db: Session, dashboard: DashboardCreate) -> Dashboard:
    db_dashboard = Dashboard(**dashboard.model_dump())
    db.add(db_dashboard)
    db.commit()
    db.refresh(db_dashboard)
    return db_dashboard

def get_dashboard(db: Session, dashboard_id: UUID) -> Optional[Dashboard]:
    return db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()

def get_dashboards(db: Session, skip: int = 0, limit: int = 100) -> List[Dashboard]:
    return db.query(Dashboard).offset(skip).limit(limit).all()

def update_dashboard(db: Session, dashboard_id: UUID, dashboard: DashboardUpdate) -> Optional[Dashboard]:
    db_dashboard = get_dashboard(db, dashboard_id)
    if db_dashboard:
        update_data = dashboard.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_dashboard, key, value)
        db.commit()
        db.refresh(db_dashboard)
    return db_dashboard

def delete_dashboard(db: Session, dashboard_id: UUID) -> bool:
    db_dashboard = get_dashboard(db, dashboard_id)
    if db_dashboard:
        db.delete(db_dashboard)
        db.commit()
        return True
    return False

# Datasource CRUD
def create_datasource(db: Session, datasource: DatasourceCreate) -> Datasource:
    # Map legacy field db_id to new database_connection_id
    db_connection_id = getattr(datasource, 'db_id', None)

    # Coerce type to lowercase string
    ds_type = getattr(datasource, 'type', None)
    if ds_type is not None and not isinstance(ds_type, DatasourceType):
        try:
            ds_type = DatasourceType(ds_type)  # handle str like 'table'
        except Exception:
            ds_type = getattr(ds_type, 'value', ds_type)
    ds_type_str = ds_type.value.lower() if isinstance(ds_type, DatasourceType) else (str(ds_type).lower() if ds_type is not None else None)

    db_datasource = Datasource(
        name=datasource.name,
        type=ds_type_str,
        database_connection_id=db_connection_id,
        table_name=datasource.table_name,
        sql=datasource.sql,
        description=datasource.description
    )
    db.add(db_datasource)
    db.flush()  # 获取 ID
    
    # 创建列定义，persist enum values as lowercase strings
    for col_data in datasource.columns:
        col_dict = col_data.model_dump()
        col_type = col_dict.get('type')
        if not isinstance(col_type, ColumnType):
            try:
                col_type = ColumnType(getattr(col_type, 'value', col_type))
            except Exception:
                pass
        col_role = col_dict.get('role')
        if not isinstance(col_role, ColumnRole):
            try:
                col_role = ColumnRole(getattr(col_role, 'value', col_role))
            except Exception:
                pass
        db_column = ColumnDef(
            datasource_id=db_datasource.id,
            name=col_dict['name'],
            type=(col_type.value.lower() if isinstance(col_type, ColumnType) else str(col_type).lower()),
            role=(col_role.value.lower() if isinstance(col_role, ColumnRole) else (str(col_role).lower() if col_role is not None else 'dimension')),
            description=col_dict.get('description'),
            is_filterable=col_dict.get('is_filterable', True),
            is_groupable=col_dict.get('is_groupable', True),
            format_string=col_dict.get('format_string'),
            default_aggregation=col_dict.get('default_aggregation')
        )
        db.add(db_column)
    
    db.commit()
    db.refresh(db_datasource)
    return db_datasource

def get_datasource(db: Session, datasource_id: UUID) -> Optional[Datasource]:
    return db.query(Datasource).filter(Datasource.id == datasource_id).first()

def get_datasources(db: Session, skip: int = 0, limit: int = 100) -> List[Datasource]:
    return db.query(Datasource).offset(skip).limit(limit).all()

def update_datasource(db: Session, datasource_id: UUID, datasource: DatasourceUpdate) -> Optional[Datasource]:
    db_datasource = get_datasource(db, datasource_id)
    if db_datasource:
        update_data = datasource.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_datasource, key, value)
        db.commit()
        db.refresh(db_datasource)
    return db_datasource

def delete_datasource(db: Session, datasource_id: UUID) -> bool:
    db_datasource = get_datasource(db, datasource_id)
    if db_datasource:
        db.delete(db_datasource)
        db.commit()
        return True
    return False

# Component CRUD
def create_component(db: Session, component: ComponentCreate) -> Component:
    db_component = Component(**component.model_dump())
    db.add(db_component)
    db.commit()
    db.refresh(db_component)
    return db_component

def get_component(db: Session, component_id: UUID) -> Optional[Component]:
    return db.query(Component).filter(Component.id == component_id).first()

def get_components_by_dashboard(db: Session, dashboard_id: UUID) -> List[Component]:
    return db.query(Component).filter(Component.dashboard_id == dashboard_id).all()

def get_components(db: Session, skip: int = 0, limit: int = 100) -> List[Component]:
    return db.query(Component).offset(skip).limit(limit).all()

def update_component(db: Session, component_id: UUID, component: ComponentUpdate) -> Optional[Component]:
    db_component = get_component(db, component_id)
    if db_component:
        update_data = component.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_component, key, value)
        db.commit()
        db.refresh(db_component)
    return db_component

def delete_component(db: Session, component_id: UUID) -> bool:
    db_component = get_component(db, component_id)
    if db_component:
        db.delete(db_component)
        db.commit()
        return True
    return False

# Column CRUD
def add_column_to_datasource(db: Session, datasource_id: UUID, column: ColumnDefCreate) -> ColumnDef:
    db_column = ColumnDef(
        datasource_id=datasource_id,
        **column.model_dump()
    )
    db.add(db_column)
    db.commit()
    db.refresh(db_column)
    return db_column

def get_columns_by_datasource(db: Session, datasource_id: UUID) -> List[ColumnDef]:
    return db.query(ColumnDef).filter(ColumnDef.datasource_id == datasource_id).all()

def delete_column(db: Session, column_id: UUID) -> bool:
    db_column = db.query(ColumnDef).filter(ColumnDef.id == column_id).first()
    if db_column:
        db.delete(db_column)
        db.commit()
        return True
    return False

# Utility functions
def get_chart_context_for_component(db: Session, component_id: UUID) -> Optional[dict]:
    """为组件生成 ChartContext"""
    component = get_component(db, component_id)
    if not component or not component.datasource:
        return None
    
    datasource = component.datasource
    columns = get_columns_by_datasource(db, datasource.id)

    # Support both Enum and str for datasource.type
    ds_type_val = getattr(datasource.type, 'value', datasource.type)
    
    table_info = {
        "name": datasource.table_name if ds_type_val == "table" else "query_result",
        "columns": [col.name for col in columns]
    }
    # 对查询型数据源，附带 base_sql 以便 MCP 工具注入虚拟表
    if ds_type_val != "table" and getattr(datasource, 'sql', None):
        table_info["base_sql"] = datasource.sql
    
    return {"tables": [table_info]}

def get_datasource_with_columns(db: Session, datasource_id: UUID) -> Optional[Datasource]:
    """获取包含列信息的数据源"""
    datasource = db.query(Datasource).filter(Datasource.id == datasource_id).first()
    if datasource:
        # SQLAlchemy 会自动加载关联的 columns
        pass
    return datasource
