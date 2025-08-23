"""
Component configuration examples for different chart types
参考 Superset 和 ECharts 的设计思路
- Updated: line/bar charts now prefer multi-series via encoding.series
- Backward compatible: legacy encoding.y (and optional color) still accepted by validator
"""

# 折线图配置示例（新版：多系列）
LINE_CHART_CONFIG = {
    "encoding": {
        "x": "date",           # 时间轴
        # 新：多系列，每个系列指定 y 字段，可选 label / color
        "series": [
            {"y": "close", "label": "Close", "color": "#1f77b4"},
            # 可继续添加更多系列
            # {"y": "volume", "label": "Volume", "color": "#ff7f0e"},
        ]
    },
    "mark": "line",
    "options": {
        "smooth": True,
        "showPoints": False,
        "connectNulls": True
    }
}

# 兼容：折线图（旧版示例，仅供参考/迁移）
LINE_CHART_CONFIG_LEGACY = {
    "encoding": {
        "x": "date",           # 时间轴
        "y": "close",          # 数值轴（旧）
        "color": "symbol"      # 分组/系列（旧，可选）
    },
    "mark": "line",
    "options": {
        "smooth": True,
        "showPoints": False,
        "connectNulls": True
    }
}

# K线图（蜡烛图）配置示例
CANDLESTICK_CONFIG = {
    "encoding": {
        "x": "date",
        "open": "open",
        "high": "high", 
        "low": "low",
        "close": "close",
        "volume": "volume"  # 可选，用于成交量
    },
    "mark": "candlestick",
    "options": {
        "color": {
            "up": "#26a69a",      # 上涨颜色
            "down": "#ef5350"     # 下跌颜色
        },
        "showVolume": True
    }
}

# 条形图配置示例（新版：多系列 + 可叠加）
BAR_CHART_CONFIG = {
    "encoding": {
        "x": "symbol",
        # 新：多系列，每个系列指定 y 字段，可选 label / color
        "series": [
            {"y": "avg_close", "label": "Avg Close", "color": "#1f77b4"},
            # {"y": "avg_open", "label": "Avg Open", "color": "#ff7f0e"},
        ]
    },
    "mark": "bar",
    "options": {
        "orientation": "vertical",  # vertical | horizontal
        "stacked": False              # 新：支持堆叠条形图
    }
}

# 兼容：条形图（旧版示例，仅供参考/迁移）
BAR_CHART_CONFIG_LEGACY = {
    "encoding": {
        "x": "symbol",
        "y": "avg_close"
    },
    "mark": "bar",
    "options": {
        "orientation": "vertical"
    }
}

# 指标卡配置示例
METRIC_CONFIG = {
    "encoding": {
        "value": "close",
        "filter": "symbol='NVDA'"
    },
    "mark": "metric",
    "options": {
        "agg": "last",              # 聚合方式: last, avg, sum, max, min
        "format": "${:,.2f}",       # 数值格式化
        "prefix": "Latest Price: ",
        "suffix": " USD",
        "comparison": {             # 可选：对比显示
            "enable": True,
            "period": "1d",         # 对比周期
            "format": "{:+.2%}"     # 变化率格式
        }
    }
}

# 饼图配置示例
PIE_CHART_CONFIG = {
    "encoding": {
        "angle": "market_cap",      # 扇形角度
        "color": "sector"           # 扇形颜色
    },
    "mark": "pie",
    "options": {
        "innerRadius": 0,           # 0=饼图, >0=环形图
        "showLabels": True,
        "showPercentage": True
    }
}

# 散点图配置示例
SCATTER_CONFIG = {
    "encoding": {
        "x": "pe_ratio",
        "y": "return_1y", 
        "size": "market_cap",       # 气泡大小
        "color": "sector"           # 颜色分组
    },
    "mark": "scatter",
    "options": {
        "showTrendLine": True
    }
}

# 文本组件配置示例
TEXT_CONFIG = {
    "encoding": {
        "content": "analysis_text"
    },
    "mark": "text",
    "options": {
        "markdown": True,           # 支持 Markdown
        "fontSize": 14,
        "textAlign": "left"
    }
}

# 自定义组件配置示例（给前端最大的灵活性）
CUSTOM_CONFIG = {
    "encoding": {
        # 完全由前端定义
    },
    "mark": "custom",
    "options": {
        "component": "TradingViewChart",  # 前端组件名
        "props": {
            "symbol": "AAPL",
            "interval": "1D",
            "theme": "dark"
        }
    }
}

# 配置模板映射
CONFIG_TEMPLATES = {
    "line": LINE_CHART_CONFIG,
    "candlestick": CANDLESTICK_CONFIG,
    "bar": BAR_CHART_CONFIG,
    "metric": METRIC_CONFIG,
    "pie": PIE_CHART_CONFIG,
    "scatter": SCATTER_CONFIG,
    "text": TEXT_CONFIG,
    "custom": CUSTOM_CONFIG
}

def get_config_template(chart_type: str) -> dict:
    """获取图表类型的配置模板"""
    return CONFIG_TEMPLATES.get(chart_type, {})

def _has_nonempty_series(encoding: dict) -> bool:
    try:
        s = encoding.get("series")
        return isinstance(s, list) and len(s) > 0 and all(isinstance(it, dict) and it.get("y") for it in s)
    except Exception:
        return False

def validate_config_for_type(chart_type: str, config: dict) -> bool:
    """验证配置是否符合图表类型要求
    - 支持新版多系列结构：encoding.series: [{ y, label?, color? }]
    - 向后兼容旧版：encoding.y (+ encoding.color)
    """
    template = get_config_template(chart_type)
    if not template:
        return True  # 未知类型，跳过验证
    
    # 基础验证：检查必需的 encoding 字段
    if "encoding" not in config or not isinstance(config.get("encoding"), dict):
        return False
    
    encoding = config.get("encoding", {})
    config_fields = set(encoding.keys())

    if chart_type == "candlestick":
        required = {"x", "open", "high", "low", "close"}
        return required.issubset(config_fields)

    if chart_type in ("line", "bar"):
        # 新：需要 x + series（非空），或旧：x + y
        if "x" not in config_fields:
            return False
        if _has_nonempty_series(encoding):
            return True
        # 兼容旧版：允许 x + y
        return "y" in config_fields

    if chart_type == "metric":
        return "value" in config_fields

    # 其它类型不做强校验
    return True
