"""
增强的CRUD操作，支持Superset风格的数据可视化功能
"""
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc
from uuid import UUID

from app.models import (
    Dashboard, 
    Datasource, 
    Component, 
    ColumnDef, 
    DatabaseConnection,
    QueryCache,
    AuditLog
)
from app.schemas import (
    DashboardCreate, DashboardUpdate,
    DatasourceCreateEnhanced, DatasourceUpdateEnhanced,
    ComponentCreateEnhanced, ComponentUpdateEnhanced,
    ColumnDefCreate, ColumnDefUpdate,
    DatabaseConnectionCreate, DatabaseConnectionUpdate,
    QueryRequest,
    ComponentQueryRequest,
)
from app.database_service import database_service
from app.logger import log


class EnhancedCRUD:
    """增强的CRUD操作类"""
    
    # Database Connection CRUD
    def create_database_connection(self, db: Session, connection: DatabaseConnectionCreate) -> DatabaseConnection:
        """创建数据库连接"""
        # Start new connections as inactive until tested OK
        data = connection.model_dump()
        data.setdefault('is_active', False)
        db_connection = DatabaseConnection(**data)
        db.add(db_connection)
        db.commit()
        db.refresh(db_connection)
        
        # 记录审计日志
        self._log_action(db, "create", "database_connection", db_connection.id, connection.model_dump())
        
        return db_connection
    
    def get_database_connections(self, db: Session, skip: int = 0, limit: int = 100) -> List[DatabaseConnection]:
        """获取数据库连接列表（包含Active与Inactive）"""
        return db.query(DatabaseConnection).offset(skip).limit(limit).all()
    
    def get_database_connection(self, db: Session, connection_id: UUID) -> Optional[DatabaseConnection]:
        """获取单个数据库连接（不限制Active，以便编辑/测试未激活连接）"""
        return db.query(DatabaseConnection).filter(
            DatabaseConnection.id == connection_id
        ).first()
    
    def update_database_connection(
        self, 
        db: Session, 
        connection_id: UUID, 
        connection_update: DatabaseConnectionUpdate
    ) -> Optional[DatabaseConnection]:
        """更新数据库连接"""
        db_connection = self.get_database_connection(db, connection_id)
        if not db_connection:
            return None
        
        update_data = connection_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_connection, field, value)
        
        db.commit()
        db.refresh(db_connection)
        
        # 记录审计日志
        self._log_action(db, "update", "database_connection", connection_id, update_data)
        
        return db_connection
    
    def delete_database_connection(self, db: Session, connection_id: UUID) -> bool:
        """删除数据库连接（硬删除）
        - 将关联的数据源标记为 inactive，并解除其与该连接的绑定
        - 然后删除数据库连接记录
        """
        db_connection = self.get_database_connection(db, connection_id)
        if not db_connection:
            return False
        # 处理关联的数据源，避免外键约束阻止删除
        related_ds = db.query(Datasource).filter(Datasource.database_connection_id == connection_id).all()
        for ds in related_ds:
            ds.is_active = False
            ds.database_connection_id = None
        # 删除连接
        db.delete(db_connection)
        db.commit()
        # 审计日志
        self._log_action(db, "delete", "database_connection", connection_id, {"detached_datasources": len(related_ds)})
        return True
    
    def test_database_connection(self, db: Session, connection_id: UUID) -> bool:
        """测试数据库连接，并根据结果更新激活状态"""
        db_connection = self.get_database_connection(db, connection_id)
        if not db_connection:
            return False
        
        ok, err = database_service.test_connection_with_error(db_connection)
        # Update connection active based on test result and propagate to datasources
        db_connection.is_active = bool(ok)
        for ds in db.query(Datasource).filter(Datasource.database_connection_id == connection_id).all():
            ds.is_active = bool(ok)
        db.commit()
        # 返回布尔值以保持兼容；错误文本可通过新的辅助方法取回
        return ok

    def test_database_connection_with_error(self, db: Session, connection_id: UUID) -> Tuple[bool, Optional[str]]:
        """测试数据库连接并返回错误信息"""
        db_connection = self.get_database_connection(db, connection_id)
        if not db_connection:
            return False, "Connection not found"
        ok, err = database_service.test_connection_with_error(db_connection)
        db_connection.is_active = bool(ok)
        for ds in db.query(Datasource).filter(Datasource.database_connection_id == connection_id).all():
            ds.is_active = bool(ok)
        db.commit()
        return ok, err
    
    # Enhanced Datasource CRUD
    def create_datasource_enhanced(self, db: Session, datasource: DatasourceCreateEnhanced) -> Datasource:
        """创建增强的数据源"""
        # 创建数据源（默认跟随数据库连接的active状态）
        datasource_data = datasource.model_dump(exclude={'columns'})
        if datasource_data.get('is_active') is None:
            # If linked to a connection, follow its current active state
            if datasource_data.get('database_connection_id'):
                conn = self.get_database_connection(db, datasource_data['database_connection_id'])
                datasource_data['is_active'] = bool(conn.is_active) if conn else False
            else:
                datasource_data['is_active'] = False
        db_datasource = Datasource(**datasource_data)
        db.add(db_datasource)
        db.flush()  # 获取ID但不提交
        
        # 创建列定义
        for column_data in datasource.columns:
            payload = column_data.model_dump()
            # Persist enum values as lowercase strings
            if 'type' in payload:
                t = payload['type']
                payload['type'] = (t.value if hasattr(t, 'value') else str(t)).lower()
            if 'role' in payload and payload['role'] is not None:
                r = payload['role']
                payload['role'] = (r.value if hasattr(r, 'value') else str(r)).lower()
            column = ColumnDef(
                datasource_id=db_datasource.id,
                **payload
            )
            db.add(column)
        
        db.commit()
        db.refresh(db_datasource)
        
        # 记录审计日志
        self._log_action(db, "create", "datasource", db_datasource.id, datasource.model_dump())
        
        return db_datasource
    
    def _normalize_datasource(self, ds):
        # Coerce enum to its value or leave string as-is
        try:
            if hasattr(ds, 'type') and hasattr(ds.type, 'value'):
                ds.type = ds.type.value
        except Exception:
            pass
        # Ensure configuration is a dict
        if getattr(ds, 'configuration', None) is None:
            ds.configuration = {}
        # Ensure booleans/ints have defaults
        if getattr(ds, 'is_active', None) is None:
            ds.is_active = True
        if getattr(ds, 'cache_timeout', None) is None:
            ds.cache_timeout = 300
        # Normalize nested columns' enums
        for col in getattr(ds, 'columns', []) or []:
            try:
                if hasattr(col, 'type') and hasattr(col.type, 'value'):
                    col.type = col.type.value
            except Exception:
                pass
            try:
                if hasattr(col, 'role') and hasattr(col.role, 'value'):
                    col.role = col.role.value
            except Exception:
                pass
        return ds

    def _migrate_config_schema(self, component: Component) -> Component:
        """Migrate legacy line/bar config to new multi-series contract on read.
        - If encoding.y exists and encoding.series is missing, move y into series[0].
        - Preserve legacy encoding.color as _legacyColor to avoid confusion with per-series color.
        - Ensure bar.options.stacked has a boolean default (False) when missing.
        """
        try:
            cfg = getattr(component, 'config', None)
            if not isinstance(cfg, dict):
                return component
            comp_type = getattr(component.component_type, 'value', component.component_type)
            t = str(comp_type or '').lower()
            if t not in ('line', 'bar'):
                return component
            enc = cfg.get('encoding') if isinstance(cfg.get('encoding'), dict) else {}
            if isinstance(enc, dict) and 'series' not in enc and enc.get('y'):
                s_item: Dict[str, Any] = { 'y': enc.get('y') }
                # Optional hint label from y
                try:
                    y_field = str(enc.get('y'))
                    if y_field:
                        s_item.setdefault('label', y_field)
                except Exception:
                    pass
                # Migrate
                enc['series'] = [s_item]
                enc.pop('y', None)
                # Keep legacy color if present (it used to be a grouping dimension)
                if 'color' in enc and enc.get('color') is not None:
                    enc['_legacyColor'] = enc.pop('color')
                cfg['encoding'] = enc
            # Default stacked for bar
            if t == 'bar':
                opts = cfg.get('options') if isinstance(cfg.get('options'), dict) else {}
                if 'stacked' not in opts:
                    opts['stacked'] = False
                cfg['options'] = opts
            component.config = cfg
        except Exception:
            # no-op if anything goes wrong
            pass
        return component

    def get_datasources_enhanced(
        self, 
        db: Session, 
        skip: int = 0, 
        limit: int = 100,
        include_columns: bool = True
    ) -> List:
        """获取增强的数据源列表"""
        query = db.query(Datasource).filter(Datasource.is_active == True)
        if include_columns:
            query = query.options(joinedload(Datasource.columns))
        results = query.offset(skip).limit(limit).all()
        return [self._normalize_datasource(ds) for ds in results]
    
    def get_datasource_enhanced(self, db: Session, datasource_id: UUID) -> Optional:
        """获取单个增强的数据源"""
        ds = db.query(Datasource).options(
            joinedload(Datasource.columns),
            joinedload(Datasource.database_connection)
        ).filter(
            Datasource.id == datasource_id,
            Datasource.is_active == True
        ).first()
        
        # 若没有列定义且为 query 类型，尝试自动推断并保存列
        try:
            if ds and (not ds.columns or len(ds.columns) == 0):
                ds_type = getattr(ds.type, 'value', ds.type)
                if str(ds_type).lower() == 'query' and ds.database_connection:
                    # 运行一次最小查询以拿到列
                    data, cols, _ = database_service.execute_datasource_query(db, ds, limit=1)
                    if (not cols or len(cols) == 0) and isinstance(data, list) and data:
                        first = data[0] if isinstance(data[0], dict) else {}
                        cols = [{ 'name': k, 'type': 'string' } for k in first.keys()]
                    # 写入列定义
                    created = False
                    for c in (cols or []):
                        name = c.get('name')
                        if not name:
                            continue
                        ctype = (c.get('type') or 'string').lower()
                        if ctype not in ('string', 'number', 'datetime', 'boolean'):
                            ctype = 'string'
                        db.add(ColumnDef(
                            datasource_id=ds.id,
                            name=name,
                            type=ctype,
                            role='dimension',
                            is_filterable=True,
                            is_groupable=True,
                        ))
                        created = True
                    if created:
                        db.commit()
                        db.refresh(ds)
        except Exception:
            db.rollback()
        
        return self._normalize_datasource(ds) if ds else None
    
    def get_datasource_tables(self, db: Session, connection_id: UUID) -> List[str]:
        """获取数据库连接中的所有表"""
        connection = self.get_database_connection(db, connection_id)
        if not connection:
            return []
        
        return database_service.get_table_names(connection)
    
    def get_table_schema(self, db: Session, connection_id: UUID, table_name: str) -> List[Dict[str, Any]]:
        """获取表结构"""
        connection = self.get_database_connection(db, connection_id)
        if not connection:
            return []
        
        return database_service.get_table_schema(connection, table_name)
    
    def preview_datasource_data(
        self, 
        db: Session, 
        datasource_id: UUID, 
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """预览数据源数据"""
        datasource = self.get_datasource_enhanced(db, datasource_id)
        if not datasource or not datasource.database_connection:
            raise ValueError("Datasource not found or has no database connection")
        
        try:
            data, columns, execution_time = database_service.execute_datasource_query(
                db, datasource, limit=limit, offset=offset, use_cache=False
            )
            
            # 当驱动未返回列信息时，基于首行数据进行回退推断
            inferred_from_rows = False
            if (not columns or len(columns) == 0) and isinstance(data, list) and data:
                inferred_from_rows = True
                first = data[0] if isinstance(data[0], dict) else {}
                def _infer_type(v):
                    import datetime as _dt
                    if v is None:
                        return 'string'
                    if isinstance(v, bool):
                        return 'boolean'
                    if isinstance(v, (int, float)):
                        return 'number'
                    if isinstance(v, (_dt.date, _dt.datetime)):
                        return 'datetime'
                    return 'string'
                columns = [{ 'name': k, 'type': _infer_type(first.get(k)) } for k in first.keys()]
            
            # 如果该数据源还没有保存的列定义，尝试基于本次预览的列自动写入列定义（一次性）
            try:
                if not getattr(datasource, 'columns', None):
                    col_defs = []
                    for c in (columns or []):
                        name = c.get('name')
                        if not name:
                            continue
                        ctype = (c.get('type') or 'string').lower()
                        # 规范化到模型允许的类型集合
                        if ctype not in ('string', 'number', 'datetime', 'boolean'):
                            # 若是未知类型，用 string 兜底
                            ctype = 'string'
                        col_defs.append(ColumnDef(
                            datasource_id=datasource.id,
                            name=name,
                            type=ctype,
                            role='dimension',
                            is_filterable=True,
                            is_groupable=True,
                        ))
                    if col_defs:
                        for cd in col_defs:
                            db.add(cd)
                        db.commit()
                        # 刷新以便后续查询能看到
                        db.refresh(datasource)
            except Exception as _e:
                # 不阻断预览
                db.rollback()
            
            ds_type = getattr(datasource.type, 'value', datasource.type)
            return {
                'data': data,
                'columns': columns,
                'row_count': len(data),
                'execution_time_ms': execution_time,
                'offset': offset,
                'limit': limit,
                'datasource_info': {
                    'id': str(datasource.id),
                    'name': datasource.name,
                    'type': ds_type
                }
            }
        except Exception as e:
            log(f"Failed to preview datasource data: {e}")
            raise e
    
    # Enhanced Component CRUD
    def create_component_enhanced(self, db: Session, component: ComponentCreateEnhanced) -> Component:
        """创建增强的组件"""
        payload = component.model_dump()
        # Persist component_type as lowercase string
        ct = payload.get('component_type')
        if isinstance(ct, str):
            payload['component_type'] = ct.lower()
        else:
            payload['component_type'] = getattr(ct, 'value', str(ct)).lower()
        db_component = Component(**payload)
        db.add(db_component)
        db.commit()
        db.refresh(db_component)
        
        # 记录审计日志
        self._log_action(db, "create", "component", db_component.id, component.model_dump())
        
        return db_component
    
    def _normalize_component(self, c: Component) -> Component:
        """Coerce fields for response_model compatibility (avoid 422)."""
        try:
            if hasattr(c, 'component_type') and hasattr(c.component_type, 'value'):
                c.component_type = c.component_type.value
        except Exception:
            pass
        # Ensure dicts
        if getattr(c, 'config', None) is None:
            c.config = {}
        if getattr(c, 'query_config', None) is None:
            c.query_config = {}
        # Ensure layout ints
        for field, default in (
            ('x_position', 0), ('y_position', 0), ('width', 4), ('height', 4), ('order_index', 0)
        ):
            if getattr(c, field, None) is None:
                setattr(c, field, default)
        # Ensure active flag
        if getattr(c, 'is_active', None) is None:
            c.is_active = True
        # Migrate legacy config schema for line/bar to multi-series
        c = self._migrate_config_schema(c)
        return c

    def update_component_enhanced(self, db: Session, component_id: UUID, update: ComponentUpdateEnhanced) -> Optional[Component]:
        """更新增强组件（包括布局字段）"""
        component = db.query(Component).filter(Component.id == component_id).first()
        if not component:
            return None
        data = update.model_dump(exclude_unset=True)
        if 'component_type' in data:
            ct = data['component_type']
            data['component_type'] = ct.lower() if isinstance(ct, str) else getattr(ct, 'value', str(ct)).lower()
        for k, v in data.items():
            setattr(component, k, v)
        db.commit()
        db.refresh(component)
        self._log_action(db, "update", "component", component_id, data)
        return component

    def update_components_layout(self, db: Session, dashboard_id: UUID, updates: List[Dict[str, Any]]) -> List[Component]:
        """批量更新仪表板组件布局（x/y/width/height/order_index 及 width_ratio 到 config）"""
        # Fetch once
        comps = db.query(Component).filter(Component.dashboard_id == dashboard_id, Component.is_active == True).all()
        comp_map = {str(c.id): c for c in comps}
        changed: List[Component] = []
        for item in updates:
            cid = str(item.get('component_id'))
            c = comp_map.get(cid)
            if not c:
                continue
            for field in ('x_position','y_position','width','height','order_index'):
                if item.get(field) is not None:
                    setattr(c, field, item[field])
            # 新增：如果提供了相对宽度，则写入 config.widthRatio
            if item.get('width_ratio') is not None:
                try:
                    r = float(item.get('width_ratio'))
                    # clamp 合法范围 0.1-1.0
                    r = max(0.1, min(1.0, r))
                except Exception:
                    r = None
                if r is not None:
                    if c.config is None or not isinstance(c.config, dict):
                        c.config = {}
                    c.config['widthRatio'] = r
            changed.append(c)
        db.commit()
        # refresh changed
        for c in changed:
            db.refresh(c)
            self._log_action(db, "update", "component", c.id, {
                'x_position': c.x_position,
                'y_position': c.y_position,
                'width': c.width,
                'height': c.height,
                'order_index': c.order_index,
                'widthRatio': (c.config or {}).get('widthRatio'),
            })
        return changed

    def get_components_enhanced(
        self, 
        db: Session, 
        dashboard_id: Optional[UUID] = None,
        skip: int = 0, 
        limit: int = 100
    ) -> List[Component]:
        """获取增强的组件列表"""
        query = db.query(Component).options(
            joinedload(Component.datasource),
            joinedload(Component.dashboard)
        ).filter(Component.is_active == True)
        
        if dashboard_id:
            query = query.filter(Component.dashboard_id == dashboard_id)
        
        results = query.order_by(Component.order_index).offset(skip).limit(limit).all()
        return [self._normalize_component(c) for c in results]
    
    def get_component_enhanced(self, db: Session, component_id: UUID) -> Optional[Component]:
        """获取单个增强的组件"""
        c = db.query(Component).options(
            joinedload(Component.datasource).joinedload(Datasource.columns),
            joinedload(Component.datasource).joinedload(Datasource.database_connection),
            joinedload(Component.dashboard)
        ).filter(
            Component.id == component_id,
            Component.is_active == True
        ).first()
        return self._normalize_component(c) if c else None
    
    def execute_component_query(
        self, 
        db: Session, 
        component_id: UUID,
        query_request: Optional[ComponentQueryRequest] = None
    ) -> Dict[str, Any]:
        """执行组件查询"""
        component = self.get_component_enhanced(db, component_id)
        if not component or not component.datasource:
            raise ValueError("Component not found or has no datasource")
        
        try:
            # 使用查询请求参数或组件配置
            filters = query_request.filters if query_request else []
            aggregations = component.query_config.get('aggregations', [])
            group_by = component.query_config.get('group_by', [])
            order_by = component.query_config.get('order_by', [])
            limit = query_request.limit if query_request else 1000
            
            data, columns, execution_time = database_service.execute_datasource_query(
                db, 
                component.datasource,
                filters=filters,
                aggregations=aggregations,
                group_by=group_by,
                order_by=order_by,
                limit=limit
            )
            
            comp_type = getattr(component.component_type, 'value', component.component_type)
            return {
                'data': data,
                'columns': columns,
                'config': component.config,
                'query_config': component.query_config,
                'metadata': {
                    'component_id': str(component.id),
                    'component_name': component.name,
                    'component_type': comp_type,
                    'datasource_id': str(component.datasource.id),
                    'datasource_name': component.datasource.name,
                    'row_count': len(data),
                    'execution_time_ms': execution_time,
                    'cached': False  # 实际实现中应该检查缓存
                }
            }
        except Exception as e:
            log(f"Failed to execute component query: {e}")
            raise e
    
    def get_component_chart_context(self, db: Session, component_id: UUID) -> Optional[Dict[str, Any]]:
        """获取组件的图表上下文，用于AI查询"""
        component = self.get_component_enhanced(db, component_id)
        if not component or not component.datasource:
            return None
        
        # 先尝试获取示例数据并推断列（用于 query 类型或未配置列的情况）
        inferred_columns: List[Dict[str, Any]] = []
        try:
            sample_data, sample_cols, _ = database_service.execute_datasource_query(
                db, component.datasource, limit=5, use_cache=False
            )
            # 简单类型推断
            def _infer_type(v):
                import datetime as _dt
                if v is None:
                    return 'string'
                if isinstance(v, bool):
                    return 'boolean'
                if isinstance(v, (int, float)):
                    return 'number'
                if isinstance(v, (_dt.date, _dt.datetime)):
                    return 'datetime'
                return 'string'
            first_row = (sample_data[0] if sample_data else {}) or {}
            for c in (sample_cols or []):
                name = c.get('name')
                v = first_row.get(name) if isinstance(first_row, dict) else None
                inferred_columns.append({
                    'name': name,
                    'type': _infer_type(v),
                    'role': 'dimension',
                    'description': None
                })
        except Exception:
            sample_data = []
            inferred_columns = []
        
        # 获取已配置的列信息；若没有，则回退到推断列
        columns = [
            {
                'name': col.name,
                'type': getattr(col.type, 'value', col.type),
                'role': getattr(col.role, 'value', col.role),
                'description': col.description
            }
            for col in (component.datasource.columns or [])
        ]
        if not columns:
            columns = inferred_columns
        
        comp_type = getattr(component.component_type, 'value', component.component_type)
        ds_type = getattr(component.datasource.type, 'value', component.datasource.type)
        return {
            'component': {
                'id': str(component.id),
                'name': component.name,
                'type': comp_type,
                'config': component.config,
                'query_config': component.query_config
            },
            'datasource': {
                'id': str(component.datasource.id),
                'name': component.datasource.name,
                'type': ds_type,
                'table_name': component.datasource.table_name,
                'description': component.datasource.description
            },
            'schema': {
                'columns': columns,
                'sample_data': (sample_data or [])[:3]  # 只提供前3行作为示例
            }
        }
    
    # Dashboard CRUD (enhanced)
    def get_dashboard_with_components(self, db: Session, dashboard_id: UUID) -> Optional[Dashboard]:
        """获取包含组件的仪表板"""
        return db.query(Dashboard).options(
            joinedload(Dashboard.components).joinedload(Component.datasource)
        ).filter(Dashboard.id == dashboard_id).first()
    
    def duplicate_dashboard(self, db: Session, dashboard_id: UUID, new_name: str) -> Optional[Dashboard]:
        """复制仪表板"""
        original = self.get_dashboard_with_components(db, dashboard_id)
        if not original:
            return None
        
        # 创建新仪表板
        new_dashboard = Dashboard(
            name=new_name,
            description=f"Copy of {original.name}",
            layout=original.layout.copy()
        )
        db.add(new_dashboard)
        db.flush()
        
        # 复制组件
        for component in original.components:
            new_component = Component(
                dashboard_id=new_dashboard.id,
                datasource_id=component.datasource_id,
                name=component.name,
                component_type=getattr(component.component_type, 'value', component.component_type),
                config=component.config.copy(),
                query_config=component.query_config.copy(),
                x_position=component.x_position,
                y_position=component.y_position,
                width=component.width,
                height=component.height,
                order_index=component.order_index
            )
            db.add(new_component)
        
        db.commit()
        db.refresh(new_dashboard)
        
        # 记录审计日志
        self._log_action(db, "duplicate", "dashboard", new_dashboard.id, {
            'original_id': str(dashboard_id),
            'new_name': new_name
        })
        
        return new_dashboard
    
    # 审计日志
    def _log_action(
        self, 
        db: Session, 
        action: str, 
        resource_type: str, 
        resource_id: UUID,
        details: Optional[Dict[str, Any]] = None
    ):
        """记录操作审计日志"""
        audit_log = AuditLog(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            user_id="system",  # 将来可以从认证上下文获取
            details=details or {}
        )
        db.add(audit_log)
        # 不立即提交，让调用者决定何时提交
    
    def get_audit_logs(
        self, 
        db: Session, 
        resource_type: Optional[str] = None,
        resource_id: Optional[UUID] = None,
        skip: int = 0, 
        limit: int = 100
    ) -> List[AuditLog]:
        """获取审计日志"""
        query = db.query(AuditLog)
        
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        
        if resource_id:
            query = query.filter(AuditLog.resource_id == resource_id)
        
        return query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()


# 全局增强CRUD实例
enhanced_crud = EnhancedCRUD()
