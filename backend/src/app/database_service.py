"""
数据库查询服务
类似于Superset的数据库连接和查询功能
"""
import os
import hashlib
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date, timedelta
from decimal import Decimal
from sqlalchemy import create_engine, text, MetaData, Table, inspect
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import pandas as pd

from app.models import DatabaseConnection, Datasource, QueryCache
from app.logger import log


class DatabaseService:
    """数据库连接和查询服务"""
    
    def __init__(self):
        self.engines = {}  # 连接池
        
    def _make_json_safe(self, obj: Any) -> Any:
        """递归将对象转换为可JSON序列化的形式，用于缓存写入JSONB。
        - datetime/date -> ISO字符串
        - Decimal -> float
        - bytes -> utf-8 字符串
        其它类型保持不变或递归处理。
        """
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            try:
                return float(obj)
            except Exception:
                return str(obj)
        if isinstance(obj, bytes):
            try:
                return obj.decode('utf-8')
            except Exception:
                return obj.decode('utf-8', errors='ignore')
        if isinstance(obj, dict):
            return {k: self._make_json_safe(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple, set)):
            return [self._make_json_safe(v) for v in obj]
        # Fallback to string for unknown objects
        try:
            json.dumps(obj)
            return obj
        except Exception:
            return str(obj)
        
    def get_engine(self, connection: DatabaseConnection):
        """获取数据库引擎"""
        engine_key = str(connection.id)
        
        if engine_key not in self.engines:
            connection_string = self._build_connection_string(connection)
            self.engines[engine_key] = create_engine(
                connection_string,
                **connection.connection_params
            )
        
        return self.engines[engine_key]
    
    def _build_connection_string(self, connection: DatabaseConnection) -> str:
        """构建数据库连接字符串"""
        if connection.database_type.lower() == 'postgresql':
            return f"postgresql://{connection.username}:{connection.password}@{connection.host}:{connection.port}/{connection.database_name}"
        elif connection.database_type.lower() == 'mysql':
            return f"mysql+pymysql://{connection.username}:{connection.password}@{connection.host}:{connection.port}/{connection.database_name}"
        elif connection.database_type.lower() == 'sqlite':
            return f"sqlite:///{connection.database_name}"
        else:
            raise ValueError(f"Unsupported database type: {connection.database_type}")
    
    def test_connection(self, connection: DatabaseConnection) -> bool:
        """测试数据库连接"""
        try:
            engine = self.get_engine(connection)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            log(f"Database connection test failed: {e}")
            return False

    def test_connection_with_error(self, connection: DatabaseConnection) -> Tuple[bool, Optional[str]]:
        """测试数据库连接，返回是否成功以及错误信息"""
        try:
            engine = self.get_engine(connection)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True, None
        except Exception as e:
            log(f"Database connection test failed: {e}")
            return False, str(e)
    
    def get_table_names(self, connection: DatabaseConnection) -> List[str]:
        """获取数据库中所有表名"""
        try:
            engine = self.get_engine(connection)
            inspector = inspect(engine)
            return inspector.get_table_names()
        except Exception as e:
            log(f"Failed to get table names: {e}")
            return []
    
    def get_table_schema(self, connection: DatabaseConnection, table_name: str) -> List[Dict[str, Any]]:
        """获取表结构"""
        try:
            engine = self.get_engine(connection)
            inspector = inspect(engine)
            columns = inspector.get_columns(table_name)
            
            return [
                {
                    'name': col['name'],
                    'type': str(col['type']),
                    'nullable': col['nullable'],
                    'primary_key': col.get('primary_key', False)
                }
                for col in columns
            ]
        except Exception as e:
            log(f"Failed to get table schema: {e}")
            return []
    
    def execute_query(
        self, 
        connection: DatabaseConnection, 
        sql: str, 
        limit: int = 1000,
        offset: int = 0,
        use_cache: bool = True,
        db_session: Optional[Session] = None,
        ttl_seconds: int = 300
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]], float]:
        """执行SQL查询"""
        start_time = datetime.now()
        
        # 生成缓存键（加入offset）
        cache_key = self._generate_cache_key(connection.id, sql, limit, offset)
        
        # 检查缓存（仅当提供了 db_session 时使用持久化缓存）
        if use_cache and db_session is not None:
            cached_result = self._get_cached_result(db_session, cache_key)
            if cached_result:
                execution_time = (datetime.now() - start_time).total_seconds() * 1000
                return cached_result['data'], cached_result['columns'], execution_time
        
        try:
            engine = self.get_engine(connection)
            
            # 添加LIMIT/OFFSET子句如果需要
            sql_lower = sql.lower()
            needs_limit = bool(limit) and (' limit ' not in sql_lower)
            needs_offset = (offset and offset > 0) and (' offset ' not in sql_lower)
            if needs_limit:
                sql = f"{sql} LIMIT {limit}"
            if needs_offset:
                # 若没有显式limit但需要offset，最好仍提供一个较大limit，然而此处假定前端总会传limit
                sql = f"{sql} OFFSET {offset}"
            
            with engine.connect() as conn:
                result = conn.execute(text(sql))
                
                # 获取列信息（兼容 SQLAlchemy 2.x）
                column_names = list(result.keys())
                columns = [
                    {"name": name, "type": "unknown"}
                    for name in column_names
                ]
                
                # 获取数据
                rows = []
                for row in result:
                    rows.append(dict(row._mapping))
                
                execution_time = (datetime.now() - start_time).total_seconds() * 1000
                
                # 缓存结果
                if use_cache and db_session is not None:
                    self._cache_result(db_session, cache_key, rows, columns, sql, ttl_seconds)
                
                return rows, columns, execution_time
                
        except SQLAlchemyError as e:
            log(f"SQL execution error: {e}")
            raise e
    
    def execute_datasource_query(
        self, 
        db: Session,
        datasource: Datasource,
        filters: Optional[List[Dict[str, Any]]] = None,
        aggregations: Optional[List[Dict[str, Any]]] = None,
        group_by: Optional[List[str]] = None,
        order_by: Optional[List[Dict[str, str]]] = None,
        limit: int = 1000,
        offset: int = 0,
        use_cache: bool = True
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]], float]:
        """执行数据源查询"""
        
        if not datasource.database_connection:
            raise ValueError("Datasource has no database connection")
        
        # Determine datasource type value whether Enum or string
        ds_type_val = getattr(datasource.type, 'value', datasource.type)
        
        # 构建SQL查询
        if ds_type_val == 'table':
            sql = self._build_table_query(
                datasource.table_name,
                filters=filters,
                aggregations=aggregations,
                group_by=group_by,
                order_by=order_by
            )
        elif ds_type_val == 'query':
            sql = self._apply_query_modifications(
                datasource.sql,
                filters=filters,
                aggregations=aggregations,
                group_by=group_by,
                order_by=order_by
            )
        else:
            raise ValueError(f"Unsupported datasource type: {datasource.type}")
        
        return self.execute_query(
            datasource.database_connection,
            sql,
            limit=limit,
            offset=offset,
            use_cache=use_cache,
            db_session=db,
            ttl_seconds=int(getattr(datasource, 'cache_timeout', 300) or 300)
        )
    
    def _build_table_query(
        self,
        table_name: str,
        filters: Optional[List[Dict[str, Any]]] = None,
        aggregations: Optional[List[Dict[str, Any]]] = None,
        group_by: Optional[List[str]] = None,
        order_by: Optional[List[Dict[str, str]]] = None
    ) -> str:
        """构建表查询SQL"""
        
        # 基础查询
        if aggregations:
            select_parts = []
            for agg in aggregations:
                column = agg.get('column')
                function = agg.get('function', 'sum').upper()
                alias = agg.get('alias', f"{function.lower()}_{column}")
                select_parts.append(f"{function}({column}) AS {alias}")
            # 当存在聚合时，必须明确选择分组字段
            if group_by:
                select_list = group_by + select_parts
            else:
                select_list = select_parts
            select_clause = ", ".join(select_list)
        else:
            # 无聚合
            if group_by:
                # 仅选择分组字段，避免 SELECT * 与 GROUP BY 冲突
                select_clause = ", ".join(group_by)
            else:
                select_clause = "*"
        
        sql = f"SELECT {select_clause} FROM {table_name}"
        
        # WHERE条件
        if filters:
            where_conditions = []
            for filter_item in filters:
                column = filter_item.get('column')
                operator = filter_item.get('operator', '=')
                value = filter_item.get('value')
                
                if operator.lower() == 'in':
                    if isinstance(value, list):
                        value_list = "', '".join(str(v) for v in value)
                        where_conditions.append(f"{column} IN ('{value_list}')")
                elif operator.lower() == 'like':
                    where_conditions.append(f"{column} LIKE '%{value}%'")
                else:
                    if isinstance(value, str):
                        where_conditions.append(f"{column} {operator} '{value}'")
                    else:
                        where_conditions.append(f"{column} {operator} {value}")
            
            if where_conditions:
                sql += " WHERE " + " AND ".join(where_conditions)
        
        # GROUP BY
        if group_by:
            sql += f" GROUP BY {', '.join(group_by)}"
        
        # ORDER BY
        if order_by:
            order_parts = []
            for order in order_by:
                column = order.get('column')
                direction = order.get('direction', 'ASC').upper()
                order_parts.append(f"{column} {direction}")
            sql += f" ORDER BY {', '.join(order_parts)}"
        
        return sql
    
    def _apply_query_modifications(
        self,
        base_sql: str,
        filters: Optional[List[Dict[str, Any]]] = None,
        aggregations: Optional[List[Dict[str, Any]]] = None,
        group_by: Optional[List[str]] = None,
        order_by: Optional[List[Dict[str, str]]] = None
    ) -> str:
        """应用查询修改到现有SQL"""
        # 将基础SQL包装在子查询中以安全地应用附加子句
        # 选择列
        if aggregations:
            select_parts = []
            for agg in aggregations:
                column = agg.get('column')
                function = agg.get('function', 'sum').upper()
                alias = agg.get('alias', f"{function.lower()}_{column}")
                select_parts.append(f"{function}({column}) AS {alias}")
            if group_by:
                select_list = group_by + select_parts
            else:
                select_list = select_parts
            select_clause = ", ".join(select_list)
        else:
            if group_by:
                select_clause = ", ".join(group_by)
            else:
                select_clause = "*"
        
        sql = f"SELECT {select_clause} FROM ({base_sql}) AS subquery"
        
        # 添加过滤器
        if filters:
            where_conditions = []
            for filter_item in filters:
                column = filter_item.get('column')
                operator = filter_item.get('operator', '=')
                value = filter_item.get('value')
                
                if isinstance(value, str):
                    where_conditions.append(f"{column} {operator} '{value}'")
                else:
                    where_conditions.append(f"{column} {operator} {value}")
            
            if where_conditions:
                sql += " WHERE " + " AND ".join(where_conditions)
        
        # 分组
        if group_by:
            sql += f" GROUP BY {', '.join(group_by)}"
        
        # 排序
        if order_by:
            order_parts = []
            for order in order_by:
                column = order.get('column')
                direction = order.get('direction', 'ASC').upper()
                order_parts.append(f"{column} {direction}")
            sql += f" ORDER BY {', '.join(order_parts)}"
        
        return sql
    
    def _generate_cache_key(self, connection_id, sql: str, limit: int, offset: int) -> str:
        """生成缓存键"""
        cache_string = f"{connection_id}:{sql}:{limit}:{offset}"
        return hashlib.md5(cache_string.encode()).hexdigest()
    
    def _get_cached_result(self, db_session: Session, cache_key: str) -> Optional[Dict[str, Any]]:
        """获取缓存结果（从数据库）"""
        try:
            row = db_session.query(QueryCache).filter(QueryCache.cache_key == cache_key).first()
            if not row:
                return None
            # 过期检查
            if row.expires_at and row.expires_at < datetime.utcnow():
                # 过期后清理这条缓存
                try:
                    db_session.delete(row)
                    db_session.commit()
                except Exception:
                    db_session.rollback()
                return None
            return row.result_data or None
        except Exception as e:
            log(f"Read cache error: {e}")
            return None
    
    def _cache_result(self, db_session: Session, cache_key: str, data: List[Dict[str, Any]], columns: List[Dict[str, str]], sql: str, ttl_seconds: int = 300):
        """缓存查询结果（存入数据库）"""
        try:
            expires_at = datetime.utcnow() + timedelta(seconds=max(0, int(ttl_seconds or 0)))
            payload = {
                'data': self._make_json_safe(data),
                'columns': self._make_json_safe(columns),
            }
            row = db_session.query(QueryCache).filter(QueryCache.cache_key == cache_key).first()
            if row:
                row.query_sql = sql
                row.result_data = payload
                row.created_at = datetime.utcnow()
                row.expires_at = expires_at
            else:
                row = QueryCache(
                    cache_key=cache_key,
                    query_sql=sql,
                    result_data=payload,
                    created_at=datetime.utcnow(),
                    expires_at=expires_at
                )
                db_session.add(row)
            db_session.commit()
        except Exception as e:
            log(f"Write cache error: {e}")
            try:
                db_session.rollback()
            except Exception:
                pass
    
    def get_sample_data(self, connection: DatabaseConnection, table_name: str, limit: int = 100) -> Dict[str, Any]:
        """获取表的示例数据"""
        try:
            sql = f"SELECT * FROM {table_name} LIMIT {limit}"
            data, columns, execution_time = self.execute_query(connection, sql, limit=limit, use_cache=False)
            
            return {
                'data': data,
                'columns': columns,
                'row_count': len(data),
                'execution_time_ms': execution_time
            }
        except Exception as e:
            log(f"Failed to get sample data: {e}")
            raise e


# 全局数据库服务实例
database_service = DatabaseService()
