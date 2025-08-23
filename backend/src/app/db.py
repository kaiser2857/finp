import os
import psycopg2
from psycopg2.extras import RealDictCursor
import re

DB_URL = os.getenv("DB_URL")

def query(sql: str, params=None):
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchall()
    finally:
        conn.close()


def enforce_readonly(sql: str):
    """
    Relaxed read-only enforcement (default):
    - Allow SELECT, WITH (CTE), EXPLAIN, VALUES, and parenthesized subqueries
    - Block DDL/DML like INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/GRANT/REVOKE/TRUNCATE/VACUUM/SET/COPY

    Strict mode (DB_READONLY_STRICT=true):
    - Allow only SELECT or WITH as the entry point (or a single parenthesized subquery)
    - Disallow EXPLAIN/VALUES entry points
    - Disallow multiple statements separated by semicolons
    """
    if not sql or not isinstance(sql, str):
        raise ValueError("Query must be a non-empty string")

    s = sql.strip()
    su = s.upper()

    # Block known non-read-only operations (whole-word match)
    if re.search(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|VACUUM|SET|COPY)\b", su):
        raise ValueError("Only read-only queries are permitted")

    strict = os.getenv("DB_READONLY_STRICT", "false").strip().lower() in ("1", "true", "yes", "on")
    if strict:
        # Disallow multiple statements
        if ";" in su.strip().rstrip(";"):
            raise ValueError("Multiple statements are not allowed in strict read-only mode")
        if su.startswith("("):
            # parenthesized subquery allowed
            return
        if su.startswith("SELECT") or su.startswith("WITH"):
            return
        raise ValueError("Only SELECT/WITH statements are allowed in strict read-only mode")

    # Relaxed mode
    allowed_prefixes = ("SELECT", "WITH", "EXPLAIN", "VALUES")
    if su.startswith(allowed_prefixes) or su.startswith("("):
        return

    if "SELECT" in su:
        return

    raise ValueError("Only read-only SELECT/CTE statements are allowed")


def enforce_allowlist(sql: str, chart_context: dict):
    """
    Relaxed allowlist enforcement for AI tooling flows (default):
    - Ensure at least one allowed table name from chart_context is referenced in the SQL when a FROM clause exists
    - Skip checks for SELECTs without a FROM clause (e.g., SELECT 1, SELECT now())
    - Do NOT attempt strict column-level validation (too brittle for AI-generated SQL)
    - If no chart_context or tables provided, skip allowlist checks

    Strict mode (DB_ALLOWLIST_STRICT=true):
    - Extract table identifiers after FROM/JOIN
    - Require every referenced table to be in the allowed set
    - Disallow SELECTs without FROM (forces usage of allowed tables)
    """
    try:
        tables_ctx = (chart_context or {}).get("tables") or []
    except Exception:
        tables_ctx = []

    if not tables_ctx:
        return

    allowed_tables = [str(t.get("name", "")).lower() for t in tables_ctx if t.get("name")]
    if not allowed_tables:
        return

    s = (sql or "")
    sl = s.lower()

    strict = os.getenv("DB_ALLOWLIST_STRICT", "false").strip().lower() in ("1", "true", "yes", "on")
    if not strict:
        if " from " not in f" {sl} ":
            return
        if not any(t and t in sl for t in allowed_tables):
            raise ValueError("Query must reference at least one allowed table from context")
        return

    # Strict mode helpers
    def _strip_quotes(name: str) -> str:
        name = name.strip()
        if name.startswith('"') and name.endswith('"'):
            return name[1:-1]
        if name.startswith("'") and name.endswith("'"):
            return name[1:-1]
        return name

    def _extract_tables(sql_text: str):
        tables = []
        # capture identifiers after FROM and JOIN (simple heuristic)
        for pat in [r'\bfrom\s+([\w\.\"]+)', r'\bjoin\s+([\w\.\"]+)']:
            for m in re.finditer(pat, sql_text, flags=re.IGNORECASE):
                ident = _strip_quotes(m.group(1))
                # remove schema prefix if present
                ident = ident.split(".")[-1]
                tables.append(ident.lower())
        return list(dict.fromkeys(tables))  # de-dup, preserve order

    referenced = _extract_tables(s)
    if not referenced:
        raise ValueError("A FROM/JOIN referencing allowed tables is required in strict allowlist mode")

    for t in referenced:
        if t not in [a.lower() for a in allowed_tables]:
            raise ValueError(f"Referenced table '{t}' is not in the allowed context")
