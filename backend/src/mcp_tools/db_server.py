import os
import re
from fastmcp import FastMCP
from app.db import query, enforce_readonly, enforce_allowlist
from app.logger import log
from typing import Any, Dict

mcp = FastMCP(name="db-mcp")

# --- Simple normalization of common MySQL -> PostgreSQL syntax ---
_FMT_MAP = {
    "%Y": "YYYY",
    "%y": "YY",
    "%m": "MM",
    "%d": "DD",
    "%H": "HH24",
    "%h": "HH12",
    "%i": "MI",
    "%s": "SS",
}

def _map_datefmt(fmt: str) -> str:
    out = fmt
    for k, v in _FMT_MAP.items():
        out = out.replace(k, v)
    return out

def normalize_sql(sql: str) -> str:
    if not isinstance(sql, str):
        return sql
    s = sql
    # Backticks to double quotes
    s = s.replace("`", '"')

    # CURDATE() -> CURRENT_DATE
    s = re.sub(r"\bCURDATE\s*\(\s*\)\b", "CURRENT_DATE", s, flags=re.IGNORECASE)

    # DATE_SUB(expr, INTERVAL N UNIT) -> (expr) - INTERVAL 'N unit'
    def _date_sub(m: re.Match) -> str:
        expr = m.group("expr").strip()
        num = m.group("num")
        unit = m.group("unit").lower()
        return f"({expr}) - INTERVAL '{num} {unit}'"
    s = re.sub(r"DATE_SUB\s*\(\s*(?P<expr>[^,]+?)\s*,\s*INTERVAL\s+(?P<num>\d+)\s+(?P<unit>YEAR|MONTH|DAY|HOUR|MINUTE|SECOND)\s*\)", _date_sub, s, flags=re.IGNORECASE)

    # DATE_ADD(expr, INTERVAL N UNIT) -> (expr) + INTERVAL 'N unit'
    def _date_add(m: re.Match) -> str:
        expr = m.group("expr").strip()
        num = m.group("num")
        unit = m.group("unit").lower()
        return f"({expr}) + INTERVAL '{num} {unit}'"
    s = re.sub(r"DATE_ADD\s*\(\s*(?P<expr>[^,]+?)\s*,\s*INTERVAL\s+(?P<num>\d+)\s+(?P<unit>YEAR|MONTH|DAY|HOUR|MINUTE|SECOND)\s*\)", _date_add, s, flags=re.IGNORECASE)

    # UNIX_TIMESTAMP(expr?) -> EXTRACT(EPOCH FROM expr) or now()
    s = re.sub(r"UNIX_TIMESTAMP\s*\(\s*\)", "EXTRACT(EPOCH FROM now())", s, flags=re.IGNORECASE)
    s = re.sub(r"UNIX_TIMESTAMP\s*\(\s*([^\)]+)\s*\)", r"EXTRACT(EPOCH FROM \1)", s, flags=re.IGNORECASE)

    # FROM_UNIXTIME(n) -> to_timestamp(n)
    s = re.sub(r"FROM_UNIXTIME\s*\(\s*([^\)]+)\s*\)", r"to_timestamp(\1)", s, flags=re.IGNORECASE)

    # IFNULL(a,b) -> COALESCE(a,b)
    s = re.sub(r"\bIFNULL\s*\(", "COALESCE(", s, flags=re.IGNORECASE)

    # IF(cond,a,b) -> CASE WHEN cond THEN a ELSE b END (simple, non-nested)
    def _if_to_case(m: re.Match) -> str:
        cond, a, b = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
        return f"CASE WHEN {cond} THEN {a} ELSE {b} END"
    s = re.sub(r"\bIF\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^\)]+)\s*\)", _if_to_case, s, flags=re.IGNORECASE)

    # DATE_FORMAT(expr, fmt) -> to_char(expr, mapped_fmt)
    def _date_format(m: re.Match) -> str:
        expr = m.group(1).strip()
        fmt = m.group(2)
        mapped = _map_datefmt(fmt)
        return f"to_char({expr}, '{mapped}')"
    s = re.sub(r"DATE_FORMAT\s*\(\s*([^,]+?)\s*,\s*'([^']+)'\s*\)", _date_format, s, flags=re.IGNORECASE)

    # STR_TO_DATE(str, fmt) -> to_date(str, mapped_fmt)
    def _str_to_date(m: re.Match) -> str:
        lit = m.group(1).strip()
        fmt = m.group(2)
        mapped = _map_datefmt(fmt)
        return f"to_date({lit}, '{mapped}')"
    s = re.sub(r"STR_TO_DATE\s*\(\s*([^,]+?)\s*,\s*'([^']+)'\s*\)", _str_to_date, s, flags=re.IGNORECASE)

    # YEAR(expr) / MONTH(expr) -> EXTRACT(YEAR/MONTH FROM expr)
    s = re.sub(r"\bYEAR\s*\(\s*([^\)]+)\s*\)", r"EXTRACT(YEAR FROM \1)", s, flags=re.IGNORECASE)
    s = re.sub(r"\bMONTH\s*\(\s*([^\)]+)\s*\)", r"EXTRACT(MONTH FROM \1)", s, flags=re.IGNORECASE)

    # LIMIT offset, count -> LIMIT count OFFSET offset
    s = re.sub(r"\bLIMIT\s+(\d+)\s*,\s*(\d+)", r"LIMIT \2 OFFSET \1", s, flags=re.IGNORECASE)

    return s

# Inject CTE for virtual table backing when chartContext has base_sql for query_result

def _inject_virtual_table(sql: str, chart_context: dict) -> str:
    try:
        tables = (chart_context or {}).get("tables") or []
    except Exception:
        return sql

    s = (sql or "").strip()

    # Collect all virtual tables with base_sql: query_result, query_result_2, ...
    virtuals = []  # list of (alias, base_sql)
    for t in tables:
        name = str(t.get("name") or "")
        base = t.get("base_sql")
        if base and re.match(r"^query_result(_\d+)?$", name):
            virtuals.append((name, base))

    if virtuals:
        # Build WITH prefix for all virtuals, then merge with existing WITH if present
        prefix = ",\n".join([f"{alias} AS ({base})" for alias, base in virtuals])
        if s.upper().startswith("WITH "):
            after_with = s[5:].lstrip()
            return f"WITH {prefix},\n{after_with}"
        return f"WITH {prefix}\n{s}"

    # Fallback: if query references any query_result[_N] but no base_sql provided,
    # and there is exactly one real table in context, rewrite to that table name
    if re.search(r"\bquery_result(?:_\d+)?\b", s, flags=re.IGNORECASE):
        real_tables = [str(t.get("name")) for t in tables if t.get("name") and not re.match(r"^query_result(_\d+)?$", str(t.get("name")))]
        if len(real_tables) == 1:
            target = real_tables[0]
            s = re.sub(r"\bquery_result(?:_\d+)?\b", target, s, flags=re.IGNORECASE)
            return s

    return s

@mcp.tool
def db_describe(chartContext: dict):
    """Return allowed schema for the chart context"""
    try:
        if isinstance(chartContext, dict):
            tbls = chartContext.get("tables")
            if isinstance(tbls, list):
                return tbls
            # Legacy shape: { 'query_result': { col: type, ... } }
            q = chartContext.get("query_result")
            if isinstance(q, dict):
                return [{"name": "query_result", "columns": list(q.keys())}]
    except Exception:
        pass
    return []

@mcp.tool
def db_query(sql: str, chartContext: dict, params: list | None = None):
    """Run a readonly SQL query within chartContext whitelist"""
    normalized = normalize_sql(sql)
    if sql != normalized:
        log(f"Normalized SQL for Postgres:\nORIG: {sql}\nNORM: {normalized}")
    # Inject backing CTE if needed
    normalized = _inject_virtual_table(normalized, chartContext)

    # Guard: if the query references query_result[_N] but chartContext doesn't provide
    # matching virtual tables (with base_sql), avoid hitting the DB and return a clear error.
    try:
        tables = (chartContext or {}).get("tables") or []
        available_virtuals = {str(t.get("name")) for t in tables if t.get("name") and re.match(r"^query_result(_\d+)?$", str(t.get("name"))) and t.get("base_sql")}
        real_tables = [str(t.get("name")) for t in tables if t.get("name") and not re.match(r"^query_result(_\d+)?$", str(t.get("name")))]
        used_virtuals = set(m.group(0) for m in re.finditer(r"\bquery_result(?:_\d+)?\b", normalized, flags=re.IGNORECASE))
        # Normalize case for comparison
        used_norm = {u.lower() for u in used_virtuals}
        avail_norm = {a.lower() for a in available_virtuals}
        missing = sorted([u for u in used_norm if u not in avail_norm])
        if missing and not (len(real_tables) == 1):
            return {
                "error": "Missing virtual tables in chartContext",
                "missingVirtuals": missing,
                "availableVirtuals": sorted(list(avail_norm)),
                "hint": "When only a single table is available, avoid referencing query_result_2; use single-table techniques (self-join or conditional aggregation) or request additional context.",
                "sql": normalized,
            }
    except Exception:
        pass

    enforce_readonly(normalized)
    enforce_allowlist(normalized, chartContext)
    rows = query(normalized, params)
    return {"rows": rows}

@mcp.tool
def plot_render(spec: dict, chartContext: dict):
    """Validate a Vega-Lite-like spec against chartContext columns and return validation info.
    Expected spec.encoding fields like x, y, color, open, high, low, close for candlestick, etc.
    """
    try:
        # Build allowed columns set from context
        tables = (chartContext or {}).get("tables", [])
        allowed_columns_union = {str(c).lower() for t in tables for c in t.get("columns", [])}
        allowed_by_alias = {str(t.get("name")): {str(c).lower() for c in (t.get("columns") or [])} for t in tables if t.get("name")}
        issues: list[str] = []
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
            # Support alias.column syntax
            if "." in str(f):
                alias, col = str(f).split(".", 1)
                cols = allowed_by_alias.get(alias)
                if cols is None or col.lower() not in cols:
                    issues.append(f"Field not in context: {f} (encoding.{name})")
                return
            if str(f).lower() not in allowed_columns_union:
                issues.append(f"Field not in context: {f} (encoding.{name})")

        # Validate common encodings
        for k, v in enc.items():
            check_field(v, k)

        # Special-case candlestick
        mark = spec.get("mark")
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

def main():
    log("starting db-mcp server...")
    # Run over stdio to be compatible with typical MCP clients
    mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
