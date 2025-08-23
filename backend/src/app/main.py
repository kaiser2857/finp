import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from contextlib import asynccontextmanager

from app.agent import run_agent, run_agent_stream
from app.database import get_db, create_tables, init_sample_data
from app.schemas import (
    AgentRequest,
    DashboardCreate, DashboardUpdate, DashboardResponse,
    DatasourceCreate, DatasourceUpdate, DatasourceResponse,
    ComponentCreate, ComponentUpdate, ComponentResponse,
    ColumnDefCreate, ColumnDefResponse,
    DatabaseConnectionCreate, DatabaseConnectionUpdate, DatabaseConnectionResponse,
    DatasourceCreateEnhanced, DatasourceUpdateEnhanced, DatasourceResponseEnhanced,
    ComponentCreateEnhanced, ComponentUpdateEnhanced, ComponentResponseEnhanced,
    QueryRequest, QueryResponse, ChartDataRequest, ChartDataResponse,
    DashboardComponentsLayoutUpdate,
    ComponentQueryRequest,
)
from app import crud
from app.logger import log

# Enhanced API imports
from app.enhanced_crud import enhanced_crud
from app.database_service import database_service

# --- AI debug helpers ---
def _ai_debug_enabled() -> bool:
    try:
        return str(os.getenv("AI_DEBUG", "0")).strip().lower() in ("1", "true", "yes")
    except Exception:
        return False

def _summarize_ctx(ctx: dict) -> list:
    try:
        out = []
        for t in (ctx or {}).get("tables", []) or []:
            out.append({
                "name": t.get("name"),
                "columns_count": len(t.get("columns") or []),
                "has_base_sql": bool(t.get("base_sql")),
            })
        return out
    except Exception:
        return []

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log("Initializing Investment Research Analytics API...")
    
    # 尝试初始化数据库
    try:
        log("Attempting to connect to database...")
        if create_tables():
            log("Database tables ready")
            try:
                # Allow opt-out of sample data seeding via env flag
                seed_flag = os.getenv("SEED_SAMPLE_DATA", "true").strip().lower()
                should_seed = seed_flag not in ("0", "false", "no")
                if should_seed:
                    init_sample_data()
                    log("Sample data initialized")
                else:
                    log("Skipping sample data initialization due to SEED_SAMPLE_DATA flag")
            except Exception as e:
                log(f"Warning: Sample data initialization failed: {e}")
        else:
            log("Warning: Database table creation failed, continuing anyway...")
    except Exception as e:
        log(f"Warning: Database initialization failed: {e}")
        log("API will start in limited mode without database features")
    
    log("API startup completed")
    
    yield
    
    # Shutdown
    log("Shutting down Investment Research Analytics API...")

app = FastAPI(
    title="Investment Research Analytics API",
    description="Backend API for intelligent investment research and analytics platform",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Frontend development server
        "http://127.0.0.1:3000",  # Alternative localhost
        "http://localhost:3001",  # Alternative port
        "*"  # Allow all origins for development
    ],
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Health check
@app.get("/health")
def health():
    return {"ok": True, "service": "Investment Research Analytics API"}

# AI config endpoint
@app.get("/ai/config")
def get_ai_config():
    import json
    providers_raw = os.getenv("AI_PROVIDERS", "").strip()
    providers_cfg = []
    if providers_raw:
        try:
            cfg = json.loads(providers_raw)
            # Expect a list of providers with fields: provider, baseUrl, apiKey, models, defaultModel
            if isinstance(cfg, list):
                providers_cfg = [p for p in cfg if isinstance(p, dict) and p.get("provider")]
        except Exception as e:
            log(f"Invalid AI_PROVIDERS JSON: {e}")
            providers_cfg = []

    if providers_cfg:
        # Build sanitized response (no apiKey)
        sanitized = []
        for p in providers_cfg:
            sanitized.append({
                "provider": p.get("provider"),
                "models": list(p.get("models") or []),
                "defaultModel": p.get("defaultModel"),
                "streaming": True,
            })
        first = sanitized[0]
        # Back-compat top-level fields use first provider
        return {
            "provider": first.get("provider") or "none",
            "models": first.get("models") or [],
            "defaultModel": first.get("defaultModel"),
            "streaming": True,
            "providers": sanitized,
        }

    # Legacy single-provider env fallback
    provider = "openai" if os.getenv("OPENAI_API_KEY") else "none"
    default_model = os.getenv("OPENAI_MODEL", "gpt-4") if provider != "none" else None
    # Allow multiple models via comma-separated env var OPENAI_MODELS
    models_env = os.getenv("OPENAI_MODELS", "") if provider != "none" else ""
    models = []
    if models_env:
        models = [m.strip() for m in models_env.split(",") if m.strip()]
    # Ensure default model is included at least
    if default_model and default_model not in models:
        models.insert(0, default_model)
    return {
        "provider": provider,
        "models": models,
        "defaultModel": default_model,
        "streaming": True,
        "providers": [{
            "provider": provider,
            "models": models,
            "defaultModel": default_model,
            "streaming": True,
        }] if provider != "none" else [],
    }

# Agent endpoint (enhanced)
@app.post("/agent")
async def agent(req: AgentRequest, db: Session = Depends(get_db)):
    try:
        chart_context = req.chartContext
        if _ai_debug_enabled():
            log(f"[/agent] provider={req.provider} model={req.model} incoming_ctx={_summarize_ctx(chart_context) if isinstance(chart_context, dict) else type(chart_context).__name__}")
        
        # 如果提供了 component_id，自动生成 chartContext
        if req.component_id:
            chart_context = crud.get_chart_context_for_component(db, req.component_id)
            if not chart_context:
                raise HTTPException(status_code=404, detail="Component not found or has no datasource")
        
        # 兼容前端聚合的上下文：{ components: [...] } -> 归一化为 { tables: [...] }（多组件聚合，Phase 2）
        try:
            if (not chart_context or (isinstance(chart_context, dict) and not chart_context.get("tables"))):
                comps = (isinstance(chart_context, dict) and chart_context.get("components")) or []
                if isinstance(comps, list) and len(comps) > 0:
                    tables = []
                    virtual_count = 0
                    for comp in comps:
                        comp_id = None
                        try:
                            comp_id = comp.get("component", {}).get("id") if isinstance(comp, dict) else None
                        except Exception:
                            comp_id = None
                        # 优先用标准组件上下文（包含 base_sql）
                        table_added = False
                        if comp_id:
                            try:
                                normalized = crud.get_chart_context_for_component(db, UUID(comp_id))
                                for t in (normalized or {}).get("tables", []) or []:
                                    name = str(t.get("name") or "").strip() or "query_result"
                                    cols = list(t.get("columns") or [])
                                    base_sql = t.get("base_sql")
                                    alias = name
                                    if name == "query_result":
                                        virtual_count += 1
                                        alias = "query_result" if virtual_count == 1 else f"query_result_{virtual_count}"
                                    tables.append({k: v for k, v in {
                                        "name": alias,
                                        "columns": cols,
                                        "base_sql": base_sql,
                                    }.items() if v is not None})
                                    table_added = True
                            except Exception:
                                pass
                        # 回退：用增强上下文 schema 列构建最小表定义
                        if not table_added and isinstance(comp, dict):
                            try:
                                ds = comp.get("datasource", {})
                                schema = comp.get("schema", {})
                                cols = [c.get("name") for c in (schema.get("columns") or []) if isinstance(c, dict) and c.get("name")]
                                ds_type = str(ds.get("type") or "").lower()
                                if ds_type == "table":
                                    alias = ds.get("table_name") or "unknown_table"
                                else:
                                    virtual_count += 1
                                    alias = "query_result" if virtual_count == 1 else f"query_result_{virtual_count}"
                                tables.append({"name": alias, "columns": cols})
                            except Exception:
                                pass
                    if tables:
                        chart_context = {"tables": tables}
        except Exception:
            pass
        if _ai_debug_enabled():
            log(f"[/agent] normalized_ctx={_summarize_ctx(chart_context) if isinstance(chart_context, dict) else type(chart_context).__name__}")
        
        if not chart_context:
            raise HTTPException(status_code=400, detail="chartContext or component_id required")
        
        # audit log (pre)
        try:
            from app.enhanced_crud import enhanced_crud
            enhanced_crud._log_action(db, "agent_query", "agent", None, {
                "component_id": str(req.component_id) if req.component_id else None,
                "question": req.question,
                "chart_context_keys": list(chart_context.keys()) if isinstance(chart_context, dict) else None,
                "stream": False,
                "provider": req.provider,
                "model": req.model,
            })
            db.commit()
        except Exception as _:
            pass
        
        # per-tool audit callback
        def on_tool_event(evt: dict):
            try:
                enhanced_crud._log_action(db, "agent_tool", "agent", None, {
                    "component_id": str(req.component_id) if req.component_id else None,
                    "provider": req.provider,
                    "model": req.model,
                    **(evt or {}),
                })
                db.commit()
            except Exception:
                pass
            return None
            
        result = await run_agent(req.question, chart_context, provider=req.provider, model=req.model, on_tool_event=on_tool_event)
        # audit log (post)
        try:
            enhanced_crud._log_action(db, "agent_result", "agent", None, {
                "component_id": str(req.component_id) if req.component_id else None,
                "provider": req.provider,
                "model": req.model,
                "tool_traces_count": len((result or {}).get("tool_traces", []) if isinstance(result, dict) else []),
                "error": (result or {}).get("error") if isinstance(result, dict) else None,
            })
            db.commit()
        except Exception:
            pass
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# New: Streaming agent endpoint using Server-Sent Events
from fastapi.responses import StreamingResponse
import json

@app.post("/agent/stream")
async def agent_stream(req: AgentRequest, db: Session = Depends(get_db)):
    try:
        chart_context = req.chartContext
        if _ai_debug_enabled():
            log(f"[/agent/stream] provider={req.provider} model={req.model} incoming_ctx={_summarize_ctx(chart_context) if isinstance(chart_context, dict) else type(chart_context).__name__}")
        if req.component_id:
            chart_context = crud.get_chart_context_for_component(db, req.component_id)
            if not chart_context:
                raise HTTPException(status_code=404, detail="Component not found or has no datasource")
        # 归一化聚合上下文（Phase 2 多组件聚合）
        try:
            if (not chart_context or (isinstance(chart_context, dict) and not chart_context.get("tables"))):
                comps = (isinstance(chart_context, dict) and chart_context.get("components")) or []
                if isinstance(comps, list) and len(comps) > 0:
                    tables = []
                    virtual_count = 0
                    for comp in comps:
                        comp_id = None
                        try:
                            comp_id = comp.get("component", {}).get("id") if isinstance(comp, dict) else None
                        except Exception:
                            comp_id = None
                        table_added = False
                        if comp_id:
                            try:
                                normalized = crud.get_chart_context_for_component(db, UUID(comp_id))
                                for t in (normalized or {}).get("tables", []) or []:
                                    name = str(t.get("name") or "").strip() or "query_result"
                                    cols = list(t.get("columns") or [])
                                    base_sql = t.get("base_sql")
                                    alias = name
                                    if name == "query_result":
                                        virtual_count += 1
                                        alias = "query_result" if virtual_count == 1 else f"query_result_{virtual_count}"
                                    tables.append({k: v for k, v in {
                                        "name": alias,
                                        "columns": cols,
                                        "base_sql": base_sql,
                                    }.items() if v is not None})
                                    table_added = True
                            except Exception:
                                pass
                        if not table_added and isinstance(comp, dict):
                            try:
                                ds = comp.get("datasource", {})
                                schema = comp.get("schema", {})
                                cols = [c.get("name") for c in (schema.get("columns") or []) if isinstance(c, dict) and c.get("name")]
                                ds_type = str(ds.get("type") or "").lower()
                                if ds_type == "table":
                                    alias = ds.get("table_name") or "unknown_table"
                                else:
                                    virtual_count += 1
                                    alias = "query_result" if virtual_count == 1 else f"query_result_{virtual_count}"
                                tables.append({"name": alias, "columns": cols})
                            except Exception:
                                pass
                    if tables:
                        chart_context = {"tables": tables}
        except Exception:
            pass
        if _ai_debug_enabled():
            log(f"[/agent/stream] normalized_ctx={_summarize_ctx(chart_context) if isinstance(chart_context, dict) else type(chart_context).__name__}")
        if not chart_context:
            raise HTTPException(status_code=400, detail="chartContext or component_id required")

        # audit log (pre)
        try:
            from app.enhanced_crud import enhanced_crud
            enhanced_crud._log_action(db, "agent_query", "agent", None, {
                "component_id": str(req.component_id) if req.component_id else None,
                "question": req.question,
                "chart_context_keys": list(chart_context.keys()) if isinstance(chart_context, dict) else None,
                "stream": True,
                "provider": req.provider,
                "model": req.model,
            })
            db.commit()
        except Exception:
            pass

        async def event_generator():
            async for evt in run_agent_stream(req.question, chart_context, provider=req.provider, model=req.model):
                # Send as SSE lines
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
        # Return streaming response with SSE-friendly headers
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Dashboard endpoints
@app.post("/dashboards", response_model=DashboardResponse)
def create_dashboard(dashboard: DashboardCreate, db: Session = Depends(get_db)):
    return crud.create_dashboard(db, dashboard)

@app.get("/dashboards", response_model=List[DashboardResponse])
def list_dashboards(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_dashboards(db, skip=skip, limit=limit)

@app.get("/dashboards/{dashboard_id}", response_model=DashboardResponse)
def get_dashboard(dashboard_id: UUID, db: Session = Depends(get_db)):
    dashboard = crud.get_dashboard(db, dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard

@app.put("/dashboards/{dashboard_id}", response_model=DashboardResponse)
def update_dashboard(dashboard_id: UUID, dashboard: DashboardUpdate, db: Session = Depends(get_db)):
    updated_dashboard = crud.update_dashboard(db, dashboard_id, dashboard)
    if not updated_dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return updated_dashboard

@app.delete("/dashboards/{dashboard_id}")
def delete_dashboard(dashboard_id: UUID, db: Session = Depends(get_db)):
    success = crud.delete_dashboard(db, dashboard_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"message": "Dashboard deleted successfully"}

# ==================== ENHANCED DATASOURCE ENDPOINTS ====================

@app.post("/datasources/enhanced", response_model=DatasourceResponseEnhanced)
def create_datasource_enhanced(datasource: DatasourceCreateEnhanced, db: Session = Depends(get_db)):
    """创建增强的数据源"""
    return enhanced_crud.create_datasource_enhanced(db, datasource)

@app.get("/datasources/enhanced", response_model=List[DatasourceResponseEnhanced])
def list_datasources_enhanced(
    skip: int = 0, 
    limit: int = 100, 
    include_columns: bool = True,
    db: Session = Depends(get_db)
):
    """获取增强的数据源列表"""
    return enhanced_crud.get_datasources_enhanced(db, skip=skip, limit=limit, include_columns=include_columns)

@app.get("/datasources/enhanced/{datasource_id}", response_model=DatasourceResponseEnhanced)
def get_datasource_enhanced(datasource_id: UUID, db: Session = Depends(get_db)):
    """获取单个增强的数据源"""
    datasource = enhanced_crud.get_datasource_enhanced(db, datasource_id)
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return datasource

# New: update enhanced datasource
@app.patch("/datasources/enhanced/{datasource_id}", response_model=DatasourceResponseEnhanced)
def update_datasource_enhanced(datasource_id: UUID, datasource: DatasourceUpdateEnhanced, db: Session = Depends(get_db)):
    updated = enhanced_crud.update_datasource_enhanced(db, datasource_id, datasource)
    if not updated:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return updated

# NEW: Preview datasource data endpoint
@app.get("/datasources/{datasource_id}/preview")
def preview_datasource(datasource_id: UUID, limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    """预览数据源数据（用于前端快速查看）"""
    try:
        return enhanced_crud.preview_datasource_data(db, datasource_id, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Optional: debug endpoint to list routes
@app.get("/routes")
def list_routes():
    # Only enabled when explicitly allowed via env
    flag = os.getenv("ENABLE_DEV_ROUTES", "false").strip().lower()
    if flag in ("1", "true", "yes"): 
        return sorted([{ 
            "path": route.path,
            "name": getattr(route, "name", None),
            "methods": list(getattr(route, "methods", []) or [])
        } for route in app.router.routes], key=lambda r: r["path"]) 
    else:
        raise HTTPException(status_code=404, detail="Not Found")

# Datasource endpoints
@app.post("/datasources", response_model=DatasourceResponse)
def create_datasource(datasource: DatasourceCreate, db: Session = Depends(get_db)):
    return crud.create_datasource(db, datasource)

@app.get("/datasources", response_model=List[DatasourceResponse])
def list_datasources(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_datasources(db, skip=skip, limit=limit)

@app.get("/datasources/{datasource_id}", response_model=DatasourceResponse)
def get_datasource(datasource_id: UUID, db: Session = Depends(get_db)):
    datasource = crud.get_datasource_with_columns(db, datasource_id)
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return datasource

@app.put("/datasources/{datasource_id}", response_model=DatasourceResponse)
def update_datasource(datasource_id: UUID, datasource: DatasourceUpdate, db: Session = Depends(get_db)):
    updated_datasource = crud.update_datasource(db, datasource_id, datasource)
    if not updated_datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return updated_datasource

@app.delete("/datasources/{datasource_id}")
def delete_datasource(datasource_id: UUID, db: Session = Depends(get_db)):
    success = crud.delete_datasource(db, datasource_id)
    if not success:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return {"message": "Datasource deleted successfully"}

# Component endpoints
@app.post("/components", response_model=ComponentResponse)
def create_component(component: ComponentCreate, db: Session = Depends(get_db)):
    return crud.create_component(db, component)

@app.get("/components", response_model=List[ComponentResponse])
def list_components(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_components(db, skip=skip, limit=limit)

# New: get chart context for a component (used by tests and AI agent)
@app.get("/components/{component_id}/chart-context")
def get_component_chart_context(component_id: UUID, db: Session = Depends(get_db)):
    ctx = crud.get_chart_context_for_component(db, component_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Component not found or has no datasource")
    return ctx

@app.get("/dashboards/{dashboard_id}/components", response_model=List[ComponentResponseEnhanced])
def get_dashboard_components(dashboard_id: UUID, db: Session = Depends(get_db)):
    # 使用增强版的组件获取，返回与模型一致的响应结构
    return enhanced_crud.get_components_enhanced(db, dashboard_id=dashboard_id)

# ==================== DATABASE CONNECTION ENDPOINTS ====================

@app.post("/database-connections", response_model=DatabaseConnectionResponse)
def create_database_connection(connection: DatabaseConnectionCreate, db: Session = Depends(get_db)):
    """创建数据库连接"""
    return enhanced_crud.create_database_connection(db, connection)

@app.get("/database-connections", response_model=List[DatabaseConnectionResponse])
def list_database_connections(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """获取数据库连接列表"""
    return enhanced_crud.get_database_connections(db, skip=skip, limit=limit)

@app.get("/database-connections/{connection_id}", response_model=DatabaseConnectionResponse)
def get_database_connection(connection_id: UUID, db: Session = Depends(get_db)):
    """获取单个数据库连接"""
    connection = enhanced_crud.get_database_connection(db, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Database connection not found")
    return connection

@app.put("/database-connections/{connection_id}", response_model=DatabaseConnectionResponse)
def update_database_connection(
    connection_id: UUID, 
    connection: DatabaseConnectionUpdate, 
    db: Session = Depends(get_db)
):
    """更新数据库连接"""
    updated_connection = enhanced_crud.update_database_connection(db, connection_id, connection)
    if not updated_connection:
        raise HTTPException(status_code=404, detail="Database connection not found")
    return updated_connection

@app.delete("/database-connections/{connection_id}")
def delete_database_connection(connection_id: UUID, db: Session = Depends(get_db)):
    """删除数据库连接"""
    success = enhanced_crud.delete_database_connection(db, connection_id)
    if not success:
        raise HTTPException(status_code=404, detail="Database connection not found")
    return {"message": "Database connection deleted successfully"}

@app.post("/database-connections/{connection_id}/test")
def test_database_connection(connection_id: UUID, db: Session = Depends(get_db)):
    """测试数据库连接"""
    success = enhanced_crud.test_database_connection(db, connection_id)
    return {
        "connection_id": connection_id,
        "success": success,
        "message": "Connection successful" if success else "Connection failed"
    }

@app.post("/database-connections/{connection_id}/test-detailed")
def test_database_connection_detailed(connection_id: UUID, db: Session = Depends(get_db)):
    """测试数据库连接（详细错误信息）"""
    ok, err = enhanced_crud.test_database_connection_with_error(db, connection_id)
    return {
        "connection_id": connection_id,
        "success": ok,
        "message": "Connection successful" if ok else (f"Connection failed: {err}" if err else "Connection failed")
    }

@app.get("/database-connections/{connection_id}/tables")
def get_database_tables(connection_id: UUID, db: Session = Depends(get_db)):
    """获取数据库中的所有表"""
    tables = enhanced_crud.get_datasource_tables(db, connection_id)
    return {"tables": tables}

@app.get("/database-connections/{connection_id}/tables/{table_name}/schema")
def get_table_schema(connection_id: UUID, table_name: str, db: Session = Depends(get_db)):
    """获取表结构"""
    schema = enhanced_crud.get_table_schema(db, connection_id, table_name)
    return {"table_name": table_name, "schema": schema}

# ==================== ENHANCED COMPONENT ENDPOINTS ====================

@app.post("/components/enhanced", response_model=ComponentResponseEnhanced)
def create_component_enhanced(component: ComponentCreateEnhanced, db: Session = Depends(get_db)):
    """创建增强的组件"""
    return enhanced_crud.create_component_enhanced(db, component)

@app.get("/components/enhanced", response_model=List[ComponentResponseEnhanced])
def list_components_enhanced(
    dashboard_id: Optional[UUID] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """获取增强的组件列表"""
    return enhanced_crud.get_components_enhanced(db, dashboard_id=dashboard_id, skip=skip, limit=limit)

@app.get("/components/enhanced/{component_id}", response_model=ComponentResponseEnhanced)
def get_component_enhanced(component_id: UUID, db: Session = Depends(get_db)):
    """获取单个增强的组件"""
    component = enhanced_crud.get_component_enhanced(db, component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component

# New: update enhanced component (including layout fields)
@app.patch("/components/enhanced/{component_id}", response_model=ComponentResponseEnhanced)
def update_component_enhanced(component_id: UUID, component: ComponentUpdateEnhanced, db: Session = Depends(get_db)):
    updated = enhanced_crud.update_component_enhanced(db, component_id, component)
    if not updated:
        raise HTTPException(status_code=404, detail="Component not found")
    return updated

@app.post("/components/{component_id}/query")
def execute_component_query(
    component_id: UUID, 
    query_request: Optional[ComponentQueryRequest] = None,
    db: Session = Depends(get_db)
):
    """执行组件查询"""
    try:
        return enhanced_crud.execute_component_query(db, component_id, query_request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/components/{component_id}/chart-context-enhanced")
def get_component_chart_context_enhanced(component_id: UUID, db: Session = Depends(get_db)):
    """获取组件的增强图表上下文，用于AI查询"""
    context = enhanced_crud.get_component_chart_context(db, component_id)
    if not context:
        raise HTTPException(status_code=404, detail="Component not found or has no datasource")
    return context

# Now place the dynamic component_id endpoints after the enhanced endpoints to prevent conflicts
@app.get("/components/{component_id}", response_model=ComponentResponse)
def get_component(component_id: UUID, db: Session = Depends(get_db)):
    component = crud.get_component(db, component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component

@app.put("/components/{component_id}", response_model=ComponentResponse)
def update_component(component_id: UUID, component: ComponentUpdate, db: Session = Depends(get_db)):
    updated_component = crud.update_component(db, component_id, component)
    if not updated_component:
        raise HTTPException(status_code=404, detail="Component not found")
    return updated_component

@app.delete("/components/{component_id}")
def delete_component(component_id: UUID, db: Session = Depends(get_db)):
    success = crud.delete_component(db, component_id)
    if not success:
        raise HTTPException(status_code=404, detail="Component not found")
    return {"message": "Component deleted successfully"}

# ==================== DASHBOARD ENHANCED ENDPOINTS ====================

@app.get("/dashboards/{dashboard_id}/enhanced")
def get_dashboard_enhanced(dashboard_id: UUID, db: Session = Depends(get_db)):
    """获取包含组件的增强仪表板"""
    dashboard = enhanced_crud.get_dashboard_with_components(db, dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard

# New: batch update component layouts for a dashboard
@app.put("/dashboards/{dashboard_id}/components/layout")
def update_dashboard_components_layout(dashboard_id: UUID, payload: DashboardComponentsLayoutUpdate, db: Session = Depends(get_db)):
    """批量更新仪表板组件布局（尺寸/顺序/位置）"""
    updates = [u.model_dump(exclude_unset=True) for u in payload.updates]
    changed = enhanced_crud.update_components_layout(db, dashboard_id, updates)
    # Return changed components serialized
    return [c.to_dict() for c in changed]

@app.post("/dashboards/{dashboard_id}/duplicate")
def duplicate_dashboard(dashboard_id: UUID, new_name: str, db: Session = Depends(get_db)):
    """复制仪表板"""
    new_dashboard = enhanced_crud.duplicate_dashboard(db, dashboard_id, new_name)
    if not new_dashboard:
        raise HTTPException(status_code=404, detail="Original dashboard not found")
    return new_dashboard

# ==================== QUERY AND DATA ENDPOINTS ====================

@app.post("/query/execute")
def execute_custom_query(query_request: QueryRequest, db: Session = Depends(get_db)):
    """执行自定义查询"""
    try:
        datasource = enhanced_crud.get_datasource_enhanced(db, query_request.datasource_id)
        if not datasource:
            raise HTTPException(status_code=404, detail="Datasource not found")
        
        data, columns, execution_time = database_service.execute_datasource_query(
            db, 
            datasource,
            filters=query_request.filters,
            aggregations=query_request.aggregations,
            group_by=query_request.group_by,
            order_by=query_request.order_by,
            limit=query_request.limit
        )
        
        return {
            "data": data,
            "columns": columns,
            "row_count": len(data),
            "execution_time_ms": execution_time,
            "cached": False
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== AUDIT LOG ENDPOINTS ====================

@app.get("/audit-logs")
def get_audit_logs(
    resource_type: Optional[str] = None,
    resource_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取审计日志"""
    return enhanced_crud.get_audit_logs(
        db, 
        resource_type=resource_type, 
        resource_id=resource_id, 
        skip=skip, 
        limit=limit
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8787")))
