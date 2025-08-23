import os
from dotenv import load_dotenv
from openai import OpenAI
from app.prompts import SYSTEM_SQL, user_template
from app.logger import log
import re

# 加载环境变量
load_dotenv()

# 初始化 OpenAI 客户端，如果没有 API Key 则设为 None
client = None
if os.getenv("OPENAI_API_KEY"):
    try:
        # 使用默认的OpenAI API基础URL
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        log("OpenAI client initialized successfully")
    except Exception as e:
        log(f"Failed to initialize OpenAI client: {e}")
        client = None
else:
    log("Warning: OPENAI_API_KEY not found. AI features will be disabled.")

# New: provider registry from env JSON
import json
from typing import Tuple, Optional, Dict, Any, List, AsyncGenerator
import time
import asyncio
import threading
import uuid

# Debug flag
def _ai_debug_enabled() -> bool:
    try:
        return str(os.getenv("AI_DEBUG", "0")).strip().lower() in ("1", "true", "yes")
    except Exception:
        return False

def _sanitize_for_log(obj: Any, *, maxlen: int = 2000) -> Any:
    """Return a JSON-safe, size-bounded representation for logs."""
    try:
        data = obj
        # If it's a string, trim directly
        if isinstance(data, str):
            s = data
            return (s if len(s) <= maxlen else s[: maxlen] + "…[truncated]")
        # Try JSON
        s = json.dumps(data, ensure_ascii=False)
        if len(s) > maxlen:
            s = s[: maxlen] + "…[truncated]"
        return s
    except Exception:
        try:
            s = str(obj)
            return (s if len(s) <= maxlen else s[: maxlen] + "…[truncated]")
        except Exception:
            return "<unloggable>"

# --- MCP client setup (in-memory) ---
# We use the FastMCP Client against our in-process server instance to avoid process management.
try:
    from fastmcp import Client as MCPClient
    from mcp_tools.db_server import mcp as _db_mcp_server
    from mcp_tools.db_server import normalize_sql as _normalize_sql  # reuse normalizer
    _MCP_AVAILABLE = True
except Exception as _e:
    log(f"MCP client/server import failed: {_e}")
    MCPClient = None  # type: ignore
    _db_mcp_server = None  # type: ignore
    _MCP_AVAILABLE = False

def _to_plain_jsonable(obj: Any) -> Any:
    """Recursively convert FastMCP results (e.g., TextContent, lists of content) into plain JSON-serializable data.
    - If an object has a .text attribute and looks like JSON, parse it; otherwise return the text
    - If an object has .content, convert it recursively
    - Handle model_dump/dict for pydantic-like objects
    - Recurse into lists/tuples and dicts
    - Fallback to str(obj) if not JSON-serializable
    """
    try:
        # Primitives
        if obj is None or isinstance(obj, (str, int, float, bool)):
            return obj
        # Pydantic-like
        for attr in ("model_dump", "dict"):
            fn = getattr(obj, attr, None)
            if callable(fn):
                try:
                    val = fn()
                    return _to_plain_jsonable(val)
                except Exception:
                    pass
        # Text content
        txt = getattr(obj, "text", None)
        if isinstance(txt, str):
            s = txt.strip()
            if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
                try:
                    return _to_plain_jsonable(json.loads(s))
                except Exception:
                    return s
            return s
        # Content container
        cont = getattr(obj, "content", None)
        if cont is not None:
            return _to_plain_jsonable(cont)
        data_attr = getattr(obj, "data", None)
        if data_attr is not None:
            return _to_plain_jsonable(data_attr)
        # Mapping
        if isinstance(obj, dict):
            return {k: _to_plain_jsonable(v) for k, v in obj.items()}
        # Iterable
        if isinstance(obj, (list, tuple, set)):
            return [_to_plain_jsonable(x) for x in obj]
        # Fallback: if already JSON-serializable, keep; else str
        try:
            json.dumps(obj)
            return obj
        except Exception:
            return str(obj)
    except Exception:
        try:
            return str(obj)
        except Exception:
            return None

async def _call_mcp_tool(name: str, arguments: Dict[str, Any]) -> Any:
    """Call a tool on the local MCP server. Falls back to local shim on failure."""
    if (_MCP_AVAILABLE and MCPClient and _db_mcp_server):
        try:
            async with MCPClient(_db_mcp_server) as c:
                res = await c.call_tool(name, arguments or {})
                # Normalize to plain JSON-serializable
                return _to_plain_jsonable(res)
        except Exception as e:
            log(f"MCP tool call failed; falling back to local shim: {e}")
    # Fallback to local shim
    return _call_local_tool(name, arguments)

# New: ensure chartContext shape for tools
def _ensure_chart_context(args_ctx: Any, fallback_ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Return a valid chartContext dict of shape { 'tables': [ { name, columns, [base_sql] } ] }.
    Accepts legacy shapes like {'query_result': {col: type}} and coerces them.
    If invalid, returns fallback_ctx.
    """
    try:
        if isinstance(args_ctx, dict):
            tbls = args_ctx.get('tables')
            if isinstance(tbls, list):
                return args_ctx
            # legacy: {'query_result': { col: type, ... }}
            if isinstance(args_ctx.get('query_result'), dict):
                cols = list(args_ctx['query_result'].keys())
                return { 'tables': [ { 'name': 'query_result', 'columns': cols } ] }
        # fallback
        if isinstance(fallback_ctx, dict) and isinstance(fallback_ctx.get('tables'), list):
            return fallback_ctx
    except Exception:
        pass
    return { 'tables': [] }

# Helper: collect dataset names referenced by a Vega-Lite-like spec
def _collect_dataset_names_from_spec(spec: Dict[str, Any]) -> List[str]:
    names: set[str] = set()
    def visit(s: Any):
        try:
            if not isinstance(s, dict):
                return
            d = s.get('data')
            if isinstance(d, dict):
                nm = d.get('name')
                if isinstance(nm, str):
                    names.add(nm)
            lyr = s.get('layer')
            if isinstance(lyr, list):
                for sub in lyr:
                    visit(sub)
        except Exception:
            pass
    visit(spec or {})
    return list(names)

# Helper: build alias->rows mapping from prior db_query results using referenced virtual aliases
_ALIAS_RE = re.compile(r"\bquery_result(?:_\d+)?\b", flags=re.IGNORECASE)

def _build_datasets_from_prior_queries(referenced_names: List[str], prior_queries: List[Dict[str, Any]]) -> Dict[str, Any]:
    datasets: Dict[str, Any] = {}
    if not prior_queries:
        return datasets
    # Build alias->rows by scanning prior queries (most recent first)
    for q in reversed(prior_queries):
        try:
            rows = None
            r = q.get('result') or {}
            if isinstance(r, dict):
                rr = r.get('rows')
                if isinstance(rr, list):
                    rows = rr
            if rows is None:
                continue
            sql_text = q.get('injected_sql') or q.get('normalized_sql') or q.get('sql') or ""
            aliases = set(m.group(0) for m in _ALIAS_RE.finditer(sql_text or ""))
            if not aliases and 'query_result' not in datasets:
                datasets['query_result'] = rows
            for a in aliases:
                if a not in datasets:
                    datasets[a] = rows
        except Exception:
            pass
    # Filter to only those referenced in the spec if provided
    if referenced_names:
        # Always keep base query_result fallback if specifically referenced
        filtered: Dict[str, Any] = {}
        for n in referenced_names:
            if n in datasets:
                filtered[n] = datasets[n]
            elif n.lower() == 'query_result' and 'query_result' in datasets:
                filtered['query_result'] = datasets['query_result']
        return filtered
    return datasets

_provider_cache: Optional[list] = None

def _load_providers():
    global _provider_cache
    if (_provider_cache is not None):
        return _provider_cache
    raw = os.getenv("AI_PROVIDERS", "").strip()
    providers = []
    if (raw):
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                providers = [p for p in data if isinstance(p, dict) and p.get("provider")]
        except Exception as e:
            log(f"Invalid AI_PROVIDERS JSON: {e}")
    _provider_cache = providers
    return providers

_def_model = os.getenv("OPENAI_MODEL", "gpt-4")

# --- MCP-like tools: local implementations mapped to model function-calling ---
from app.db import query as _db_query, enforce_readonly as _enforce_ro, enforce_allowlist as _enforce_allow
from mcp_tools.db_server import normalize_sql as _normalize_sql, _inject_virtual_table as _inject_vt  # reuse normalizer and CTE injector

def _tool_db_describe(chart_context: Dict[str, Any]) -> Any:
    try:
        return (chart_context or {}).get("tables", [])
    except Exception as e:
        return {"error": str(e)}

def _tool_db_query(sql: str, chart_context: Dict[str, Any], params: Optional[List[Any]] = None) -> Any:
    # normalize and inject CTE similarly to MCP path
    sqln = _normalize_sql(sql)
    sqln = _inject_vt(sqln, chart_context)
    # Guard: detect references to virtual tables without backing base_sql in context
    try:
        tables = (chart_context or {}).get('tables') or []
        available_virtuals = {str(t.get('name')) for t in tables if t.get('name') and re.match(r'^query_result(_\d+)?$', str(t.get('name'))) and t.get('base_sql')}
        real_tables = [str(t.get('name')) for t in tables if t.get('name') and not re.match(r'^query_result(_\d+)?$', str(t.get('name')))]
        used_virtuals = set(m.group(0) for m in re.finditer(r"\bquery_result(?:_\d+)?\b", sqln, flags=re.IGNORECASE))
        used_norm = {u.lower() for u in used_virtuals}
        avail_norm = {a.lower() for a in available_virtuals}
        missing = sorted([u for u in used_norm if u not in avail_norm])
        if missing and not (len(real_tables) == 1):
            return {
                'error': 'Missing virtual tables in chartContext',
                'missingVirtuals': missing,
                'availableVirtuals': sorted(list(avail_norm)),
                'hint': 'When only a single table is available, avoid referencing query_result_2; use single-table techniques (self-join or conditional aggregation) or request additional context.',
                'sql': sqln,
            }
    except Exception:
        pass
    _enforce_ro(sqln)
    _enforce_allow(sqln, chart_context)
    rows = _db_query(sqln, params or [])
    return {'rows': rows}

def _tool_plot_render(spec: Dict[str, Any], chart_context: Dict[str, Any]) -> Any:
    try:
        tables = (chart_context or {}).get("tables", [])
        allowed_columns_union = {str(c).lower() for t in tables for c in t.get("columns", [])}
        allowed_by_alias = {str(t.get("name")): {str(c).lower() for c in (t.get("columns") or [])} for t in tables if t.get("name")}
        issues: List[str] = []
        used_fields: set[str] = set()
        enc = (spec or {}).get("encoding", {}) or {}
        def extract_field(v):
            if isinstance(v, str):
                return v
            if isinstance(v, dict):
                return v.get("field") or v.get("channel")
            return None
        def check_field(v, name: str):
            f = extract_field(v)
            if not f:
                return
            used_fields.add(str(f))
            if "." in str(f):
                alias, col = str(f).split(".", 1)
                cols = allowed_by_alias.get(alias)
                if cols is None or col.lower() not in cols:
                    issues.append(f"Field not in context: {f} (encoding.{name})")
                return
            if str(f).lower() not in allowed_columns_union:
                issues.append(f"Field not in context: {f} (encoding.{name})")
        for k, v in enc.items():
            check_field(v, k)
        mark = (spec or {}).get("mark")
        if isinstance(mark, str) and mark.lower() == "candlestick":
            for k in ["x", "open", "high", "low", "close"]:
                if k not in enc:
                    issues.append(f"Missing encoding.{k} for candlestick")
                else:
                    check_field(enc.get(k), k)
        return {
            "ok": len(issues) == 0,
            "issues": issues,
            "spec": spec,
            "allowedColumns": sorted(allowed_columns_union),
            "allowedAliases": sorted(allowed_by_alias.keys()),
            "allowedColumnsByTable": {k: sorted(list(v)) for k, v in allowed_by_alias.items()},
            "referencedFields": sorted(used_fields),
        }
    except Exception as e:
        log(f"plot_render validation error: {e}")
        return {"ok": False, "issues": [str(e)], "spec": spec}

# Build tool specs for OpenAI function calling
_TOOLS_SPEC = [
    {
        "type": "function",
        "function": {
            "name": "db_describe",
            "description": "Return allowed schema for the chart context",
            "parameters": {
                "type": "object",
                "properties": {
                    "chartContext": {"type": "object"}
                },
                "required": ["chartContext"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "db_query",
            "description": "Run a readonly SQL query within chartContext whitelist",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string"},
                    "chartContext": {"type": "object"},
                    "params": {"type": "array", "items": {"type": ["string", "number", "boolean", "null"]}},
                },
                "required": ["sql", "chartContext"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plot_render",
            "description": "Validate a Vega-Lite-like spec against chartContext columns and return validation info",
            "parameters": {
                "type": "object",
                "properties": {
                    "spec": {"type": "object"},
                    "chartContext": {"type": "object"}
                },
                "required": ["spec", "chartContext"],
            },
        },
    },
]

def _call_local_tool(name: str, arguments: Dict[str, Any]) -> Any:
    try:
        if name == "db_describe":
            return _tool_db_describe(arguments.get("chartContext"))
        if name == "db_query":
            return _tool_db_query(arguments.get("sql", ""), arguments.get("chartContext"), arguments.get("params"))
        if name == "plot_render":
            return _tool_plot_render(arguments.get("spec") or {}, arguments.get("chartContext"))
        return {"error": f"Unknown tool: {name}"}
    except Exception as e:
        return {"error": str(e)}

def _select_client_and_model(provider: Optional[str], model: Optional[str]) -> Tuple[Optional[OpenAI], Optional[str]]:
    """Select an OpenAI client and model based on AI_PROVIDERS or legacy env. Returns (client, model)."""
    # Prefer AI_PROVIDERS if present and provider specified
    providers = _load_providers()
    if providers and provider:
        match = next((p for p in providers if str(p.get("provider")) == provider), None)
        if match:
            api_key = match.get("apiKey") or os.getenv("OPENAI_API_KEY")
            base_url = match.get("baseUrl") or os.getenv("OPENAI_BASE_URL")
            chosen_model = model or match.get("defaultModel") or (match.get("models") or [None])[0]
            try:
                cl = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)
            except Exception as e:
                log(f"Failed to init provider client '{provider}': {e}")
                cl = None
            return cl, chosen_model
    # If providers defined but provider not specified, use first
    if providers and not provider:
        p0 = providers[0]
        try:
            cl = OpenAI(api_key=p0.get("apiKey") or os.getenv("OPENAI_API_KEY"), base_url=p0.get("baseUrl")) if p0.get("baseUrl") else OpenAI(api_key=p0.get("apiKey") or os.getenv("OPENAI_API_KEY"))
        except Exception as e:
            log(f"Failed to init default provider client: {e}")
            cl = None
        chosen_model = model or p0.get("defaultModel") or (p0.get("models") or [os.getenv("OPENAI_MODEL", _def_model)])[0]
        return cl, chosen_model

    # Legacy fallback to global client
    chosen_model = model or os.getenv("OPENAI_MODEL", _def_model)
    return client, chosen_model

async def _chat_completions_create_async(cl: OpenAI, **kwargs):
    """Run blocking OpenAI chat.completions.create in a thread to avoid blocking the event loop."""
    return await asyncio.to_thread(cl.chat.completions.create, **kwargs)

async def _chat_completions_stream_async(cl: OpenAI, **kwargs):
    """Run blocking OpenAI streaming completion in a background thread and yield chunks as they arrive."""
    queue: asyncio.Queue = asyncio.Queue()

    def _worker():
        try:
            stream = cl.chat.completions.create(stream=True, **kwargs)
            for event in stream:
                try:
                    queue.put_nowait(("chunk", event))
                except Exception:
                    pass
        except Exception as e:
            try:
                queue.put_nowait(("error", e))
            except Exception:
                pass
        finally:
            try:
                queue.put_nowait(("done", None))
            except Exception:
                pass

    threading.Thread(target=_worker, daemon=True).start()

    while True:
        kind, payload = await queue.get()
        if kind == "chunk":
            yield payload
        elif kind == "error":
            raise payload
        elif kind == "done":
            break

async def run_agent(question: str, chart_context: dict, *, provider: str | None = None, model: str | None = None, on_tool_event: Optional[Any] = None):
    cl, selected_model = _select_client_and_model(provider, model)
    if not cl:
        return {
            "text": "AI agent is not available. Please check your AI provider configuration.",
            "error": "AI client not initialized"
        }
    try:
        # Prepare the system message with chart context
        system_message = SYSTEM_SQL
        user_message = user_template(question, chart_context)
        request_id = str(uuid.uuid4())
        if _ai_debug_enabled():
            log(f"[agent:{request_id}] provider={provider or 'default'} model={selected_model}")
            log(f"[agent:{request_id}] chartContext={_sanitize_for_log(chart_context)}")
            log(f"[agent:{request_id}] system={_sanitize_for_log(system_message, maxlen=1200)}")
            log(f"[agent:{request_id}] user={_sanitize_for_log(user_message, maxlen=1200)}")
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ]
        tool_traces: List[Dict[str, Any]] = []
        # Track prior db_query calls to provide dataset bindings to plot_render
        prior_queries: List[Dict[str, Any]] = []

        # Function-calling loop with local tool execution
        start_ts = time.perf_counter()
        while True:
            resp = await _chat_completions_create_async(
                cl,
                model=selected_model,
                messages=messages,
                temperature=0.7,
                max_tokens=1000,
                tools=_TOOLS_SPEC,
                tool_choice="auto",
            )
            choice = resp.choices[0]
            finish_reason = getattr(choice, "finish_reason", None)
            tool_calls = getattr(getattr(choice, "message", None), "tool_calls", None)

            if tool_calls:
                # Execute tools and append results
                for tc in tool_calls:
                    name = getattr(getattr(tc, "function", None), "name", None)
                    args_json = getattr(getattr(tc, "function", None), "arguments", "{}")
                    try:
                        args = json.loads(args_json) if isinstance(args_json, str) else (args_json or {})
                    except Exception:
                        args = {}
                    # Ensure chartContext is present and valid for our tools
                    if name in ("db_query", "db_describe", "plot_render"):
                        args["chartContext"] = _ensure_chart_context(args.get("chartContext"), chart_context)
                    # Pre-compute normalized/injected SQL for logging when applicable
                    norm_sql = inj_sql = None
                    if name == "db_query":
                        try:
                            norm_sql = _normalize_sql(args.get("sql", ""))
                            inj_sql = __inj = __ctx = None
                            __ctx = args.get("chartContext")
                            inj_sql = _inject_vt(norm_sql, __ctx)
                        except Exception:
                            pass
                    if _ai_debug_enabled():
                        log(f"[agent:{request_id}] tool_call {name} args={_sanitize_for_log(args)}")
                        if norm_sql is not None:
                            log(f"[agent:{request_id}] sql.normalized={_sanitize_for_log(norm_sql)}")
                        if inj_sql is not None and inj_sql != norm_sql:
                            log(f"[agent:{request_id}] sql.injected={_sanitize_for_log(inj_sql)}")
                    # Run via MCP (with fallback)
                    result = await _call_mcp_tool(name, args)

                    # If plot_render, enrich with dataset bindings from earlier db_query results
                    try:
                        if name == "plot_render":
                            spec = (args or {}).get("spec") or {}
                            referenced = _collect_dataset_names_from_spec(spec)
                            datasets = _build_datasets_from_prior_queries(referenced, prior_queries)
                            if isinstance(result, dict) and datasets:
                                result = {**result, "datasets": datasets}
                    except Exception:
                        pass

                    # Track prior db_query results for later dataset binding
                    try:
                        if name == "db_query":
                            prior_queries.append({
                                "sql": args.get("sql"),
                                "normalized_sql": norm_sql,
                                "injected_sql": inj_sql,
                                "result": result,
                            })
                    except Exception:
                        pass

                    trace = {
                        "tool": name,
                        "arguments": args,
                        "result_preview": str(result)[:500],
                        "request_id": request_id,
                        "normalized_sql": norm_sql,
                        "injected_sql": inj_sql,
                    }
                    tool_traces.append(trace)
                    try:
                        if on_tool_event:
                            on_tool_event({
                                "type": "tool_call",
                                "tool": name,
                                "arguments": args,
                                "result": result,
                                "request_id": request_id,
                                "normalized_sql": norm_sql,
                                "injected_sql": inj_sql,
                            })
                    except Exception:
                        pass
                    messages.append({
                        "role": "tool",
                        "tool_call_id": getattr(tc, "id", None),
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False),
                    })
                    # Nudge: if db_query reports missing virtuals, provide a brief assistant hint so the model can adapt
                    try:
                        if name == "db_query" and isinstance(result, dict) and result.get("error") and result.get("missingVirtuals"):
                            messages.append({
                                "role": "assistant",
                                "content": "Detected missing virtual tables. Consider using a single-table approach (e.g., conditional aggregation or self-join) or request additional context.",
                            })
                    except Exception:
                        pass
                # Continue the loop for model to consume tool outputs
                continue

            # No tool calls; return final content
            answer = getattr(getattr(choice, "message", None), "content", None)
            log(f"OpenAI response: {answer}")
            # Extract usage if available
            usage = None
            try:
                u = getattr(resp, "usage", None)
                if u is not None:
                    # Support dict-like or object with fields
                    if isinstance(u, dict):
                        usage = {
                            "prompt_tokens": u.get("prompt_tokens"),
                            "completion_tokens": u.get("completion_tokens"),
                            "total_tokens": u.get("total_tokens"),
                        }
                    else:
                        usage = {
                            "prompt_tokens": getattr(u, "prompt_tokens", None),
                            "completion_tokens": getattr(u, "completion_tokens", None),
                            "total_tokens": getattr(u, "total_tokens", None),
                        }
            except Exception:
                pass
            latency_ms = round((time.perf_counter() - start_ts) * 1000, 2)
            if _ai_debug_enabled():
                log(f"[agent:{request_id}] final.answer={_sanitize_for_log(answer)}")
                log(f"[agent:{request_id}] final.usage={_sanitize_for_log(usage)} latency_ms={latency_ms}")
            return {
                "text": answer or "No response generated",
                "answer": answer or "No response generated",
                "raw": resp,
                "tool_traces": tool_traces,
                "usage": usage,
                "latency_ms": latency_ms,
                "request_id": request_id,
            }
    except Exception as e:
        log(f"Agent error: {e}")
        return {
            "text": f"AI agent encountered an error: {str(e)}",
            "error": str(e)
        }

# New: streaming agent
aSYNC_SLEEP_FALLBACK = 0.2

async def run_agent_stream(question: str, chart_context: dict, *, provider: str | None = None, model: str | None = None) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream assistant response with tool events. Yields dict events:
    - {'type':'tool_call_started','tool': str, 'arguments': object}
    - {'type':'tool_chunk','tool': str, 'delta': str}
    - {'type':'tool_result','tool': str, 'result': object}
    - {'type':'chunk','delta': str}
    - {'type':'done','answer': str}
    - {'type':'error','error': str}
    """
    cl, selected_model = _select_client_and_model(provider, model)
    # Fallback when client is not configured
    if not cl:
        fake = [
            "AI agent is not available.",
            " Please configure your AI providers in the backend ",
            "environment to enable streaming responses."
        ]
        assembled = ""
        for piece in fake:
            await asyncio.sleep(aSYNC_SLEEP_FALLBACK)
            assembled += piece
            yield {"type": "chunk", "delta": piece}
        yield {"type": "done", "answer": assembled}
        return

    system_message = SYSTEM_SQL
    user_message = user_template(question, chart_context)
    request_id = str(uuid.uuid4())
    if _ai_debug_enabled():
        log(f"[agent:{request_id}] (stream) provider={provider or 'default'} model={selected_model}")
        log(f"[agent:{request_id}] (stream) chartContext={_sanitize_for_log(chart_context)}")
        log(f"[agent:{request_id}] (stream) system={_sanitize_for_log(system_message, maxlen=1200)}")
        log(f"[agent:{request_id}] (stream) user={_sanitize_for_log(user_message, maxlen=1200)}")

    try:
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ]
        # Track prior db_query calls for dataset provision
        prior_queries: List[Dict[str, Any]] = []
        # Iterate tool-calling steps using non-streaming until final text is ready
        while True:
            resp = await _chat_completions_create_async(
                cl,
                model=selected_model,
                messages=messages,
                temperature=0.7,
                max_tokens=1000,
                tools=_TOOLS_SPEC,
                tool_choice="auto",
            )
            choice = resp.choices[0]
            tool_calls = getattr(getattr(choice, "message", None), "tool_calls", None)

            if tool_calls:
                for tc in tool_calls:
                    name = getattr(getattr(tc, "function", None), "name", None)
                    args_json = getattr(getattr(tc, "function", None), "arguments", "{}")
                    try:
                        args = json.loads(args_json) if isinstance(args_json, str) else (args_json or {})
                    except Exception:
                        args = {}
                    # Ensure chartContext shape
                    if name in ("db_query", "db_describe", "plot_render"):
                        args["chartContext"] = _ensure_chart_context(args.get("chartContext"), chart_context)
                    # Compute normalized/injected SQL for logs
                    norm_sql = inj_sql = None
                    if name == "db_query":
                        try:
                            norm_sql = _normalize_sql(args.get("sql", ""))
                            inj_sql = _inject_vt(norm_sql, args.get("chartContext"))
                        except Exception:
                            pass
                    if _ai_debug_enabled():
                        log(f"[agent:{request_id}] (stream) tool_call {name} args={_sanitize_for_log(args)}")
                        if norm_sql is not None:
                            log(f"[agent:{request_id}] (stream) sql.normalized={_sanitize_for_log(norm_sql)}")
                        if inj_sql is not None and inj_sql != norm_sql:
                            log(f"[agent:{request_id}] (stream) sql.injected={_sanitize_for_log(inj_sql)}")
                    # Notify start
                    try:
                        yield {"type": "tool_call_started", "tool": name, "arguments": args, "request_id": request_id, "normalized_sql": norm_sql, "injected_sql": inj_sql}
                    except Exception:
                        pass
                    # Call MCP tool and stream result in chunks (JSON string)
                    result = await _call_mcp_tool(name, args)

                    # If plot_render, enrich with datasets built from prior db_query results
                    try:
                        if name == "plot_render":
                            spec = (args or {}).get("spec") or {}
                            referenced = _collect_dataset_names_from_spec(spec)
                            datasets = _build_datasets_from_prior_queries(referenced, prior_queries)
                            if isinstance(result, dict) and datasets:
                                result = {**result, "datasets": datasets}
                    except Exception:
                        pass

                    # Chunk the result to avoid giant SSE frames
                    try:
                        result_str = json.dumps(result, ensure_ascii=False)
                    except Exception:
                        result_str = str(result)
                    for i in range(0, len(result_str), 2048):
                        yield {"type": "tool_chunk", "tool": name, "delta": result_str[i:i+2048], "request_id": request_id}
                    # Emit final tool result event
                    try:
                        yield {"type": "tool_result", "tool": name, "result": result, "request_id": request_id}
                    except Exception:
                        pass
                    # Append tool result back to the model
                    messages.append({
                        "role": "tool",
                        "tool_call_id": getattr(tc, "id", None),
                        "name": name,
                        "content": result_str,
                    })

                    # Track prior db_query after we obtain its result
                    try:
                        if name == "db_query":
                            prior_queries.append({
                                "sql": args.get("sql"),
                                "normalized_sql": norm_sql,
                                "injected_sql": inj_sql,
                                "result": result,
                            })
                    except Exception:
                        pass
                # Continue loop for another decision after tool outputs
                continue

            # No further tool calls; stream final answer
            assembled = ""
            try:
                # Iterate blocking stream in a worker thread
                async for event in _chat_completions_stream_async(
                    cl,
                    model=selected_model,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1000,
                ):
                    try:
                        delta = event.choices[0].delta.content if hasattr(event.choices[0], 'delta') else None
                    except Exception:
                        delta = None
                    if not delta:
                        continue
                    assembled += delta
                    yield {"type": "chunk", "delta": delta, "request_id": request_id}
            except Exception as e:
                yield {"type": "error", "error": str(e), "request_id": request_id}
                return
            if _ai_debug_enabled():
                log(f"[agent:{request_id}] (stream) final.answer={_sanitize_for_log(assembled)}")
            yield {"type": "done", "answer": assembled, "request_id": request_id}
            return
    except Exception as e:
        log(f"Streaming error: {e}")
        yield {"type": "error", "error": str(e)}
