import re
from mcp_tools.db_server import _inject_virtual_table, plot_render


def test_multi_cte_injection_with_two_virtuals():
    chart_ctx = {
        "tables": [
            {"name": "query_result", "columns": ["ts", "close"], "base_sql": "SELECT 1 AS a"},
            {"name": "query_result_2", "columns": ["ts", "close"], "base_sql": "SELECT 2 AS b"},
        ]
    }
    sql = "SELECT a.ts, b.close FROM query_result a JOIN query_result_2 b ON a.ts=b.ts"
    injected = _inject_virtual_table(sql, chart_ctx)
    assert injected.lstrip().upper().startswith("WITH ")
    # Both aliases present in the WITH
    assert re.search(r"\bquery_result\b\s+AS\s*\(", injected, flags=re.IGNORECASE)
    assert re.search(r"\bquery_result_2\b\s+AS\s*\(", injected, flags=re.IGNORECASE)
    # Original SELECT preserved after WITH
    assert "FROM query_result a JOIN query_result_2 b" in injected


def test_fallback_rewrite_when_single_real_table():
    chart_ctx = {
        "tables": [
            {"name": "prices", "columns": ["ts", "close"]},
        ]
    }
    sql = "SELECT * FROM query_result_3 ORDER BY ts DESC"
    injected = _inject_virtual_table(sql, chart_ctx)
    assert "FROM prices" in injected
    assert "query_result_3" not in injected


esspec_candlestick = {
    "mark": "candlestick",
    "encoding": {
        "x": {"field": "query_result.ts"},
        "open": {"field": "query_result.open"},
        "high": {"field": "query_result.high"},
        "low": {"field": "query_result.low"},
        "close": {"field": "query_result_2.close"},
    },
}


def test_plot_render_alias_qualified_fields_ok():
    chart_ctx = {
        "tables": [
            {"name": "query_result", "columns": ["ts", "open", "high", "low", "close"]},
            {"name": "query_result_2", "columns": ["ts", "close"]},
        ]
    }
    res = plot_render(esspec_candlestick, chart_ctx)
    assert res.get("ok") is True
    assert res.get("issues") == []
    # Ensure allowed alias keys are present
    assert "allowedAliases" in res
    assert "query_result" in res.get("allowedAliases")
    assert "query_result_2" in res.get("allowedAliases")
