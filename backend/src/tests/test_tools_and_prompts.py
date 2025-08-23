import asyncio
import pytest

from app import prompts as prompts_mod
from app.agent import _TOOLS_SPEC, run_agent, run_agent_stream


def _tool_names():
    return [t.get("function", {}).get("name") for t in _TOOLS_SPEC]


def test_tools_spec_includes_plot_render_and_db_tools():
    names = set(_tool_names())
    assert {"db_describe", "db_query", "plot_render"}.issubset(names)


def test_prompts_include_plot_render_guidance():
    sys_txt = getattr(prompts_mod, "SYSTEM_SQL", "")
    assert "plot_render" in sys_txt
    # Ensure guidance mentions db_describe/db_query as well
    assert "db_describe" in sys_txt and "db_query" in sys_txt


@pytest.mark.asyncio
async def test_agent_calls_tools_sequence_when_mocked(monkeypatch):
    # Arrange: mock model responses to drive db_describe -> db_query -> plot_render -> final
    call_no = {"n": 0}

    class Msg:
        def __init__(self, tool_calls=None, content=None):
            self.tool_calls = tool_calls
            self.content = content

    class Fn:
        def __init__(self, name, arguments):
            self.name = name
            self.arguments = arguments

    class TC:
        def __init__(self, name, args):
            self.function = Fn(name, args)
            self.id = "tcid"

    class Choice:
        def __init__(self, tool_calls=None, content=None):
            self.message = Msg(tool_calls=tool_calls, content=content)
            self.finish_reason = None

    class Resp:
        def __init__(self, choice):
            self.choices = [choice]
            self.usage = {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}

    async def fake_create_async(cl, **kwargs):
        n = call_no["n"]
        call_no["n"] = n + 1
        if n == 0:
            return Resp(Choice(tool_calls=[TC("db_describe", "{}")]))
        if n == 1:
            return Resp(Choice(tool_calls=[TC("db_query", '{"sql":"SELECT 1"}')]))
        if n == 2:
            return Resp(Choice(tool_calls=[TC("plot_render", '{"spec": {"mark":"line"}}')]))
        # Final answer
        return Resp(Choice(tool_calls=None, content="done"))

    async def fake_call_tool(name, arguments):
        # Minimal stub results
        if name == "db_describe":
            return [{"name": "query_result", "columns": ["ts", "value"]}]
        if name == "db_query":
            return {"rows": [{"ts": "2024-01-01", "value": 1}]}
        if name == "plot_render":
            return {"ok": True, "issues": [], "spec": arguments.get("spec", {})}
        return {"ok": True}

    def fake_select_client_and_model(provider, model):
        class Dummy:  # placeholder client
            pass
        return Dummy(), "fake-model"

    monkeypatch.setattr("app.agent._chat_completions_create_async", fake_create_async)
    monkeypatch.setattr("app.agent._call_mcp_tool", fake_call_tool)
    monkeypatch.setattr("app.agent._select_client_and_model", fake_select_client_and_model)

    ctx = {"tables": [{"name": "query_result", "columns": ["ts", "value"]}]}
    res = await run_agent("请用双折线图比较A和B", ctx)
    assert isinstance(res, dict)
    traces = res.get("tool_traces") or []
    # Expect three tool calls in order
    tools_order = [t.get("tool") for t in traces]
    assert tools_order == ["db_describe", "db_query", "plot_render"]


@pytest.mark.asyncio
async def test_agent_stream_emits_tool_events_when_mocked(monkeypatch):
    # Arrange: same sequence for streaming path
    call_no = {"n": 0}

    class Msg:
        def __init__(self, tool_calls=None, content=None):
            self.tool_calls = tool_calls
            self.content = content

    class Fn:
        def __init__(self, name, arguments):
            self.name = name
            self.arguments = arguments

    class TC:
        def __init__(self, name, args):
            self.function = Fn(name, args)
            self.id = "tcid"

    class Choice:
        def __init__(self, tool_calls=None, content=None):
            self.message = Msg(tool_calls=tool_calls, content=content)
            self.finish_reason = None

    class Resp:
        def __init__(self, choice):
            self.choices = [choice]
            self.usage = {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}

    async def fake_create_async(cl, **kwargs):
        n = call_no["n"]
        call_no["n"] = n + 1
        if n == 0:
            return Resp(Choice(tool_calls=[TC("db_describe", "{}")]))
        if n == 1:
            return Resp(Choice(tool_calls=[TC("db_query", '{"sql":"SELECT 1"}')]))
        if n == 2:
            return Resp(Choice(tool_calls=[TC("plot_render", '{"spec": {"mark":"line"}}')]))
        # Final step has no tool calls so streaming will start
        return Resp(Choice(tool_calls=None, content=None))

    async def fake_stream_async(cl, **kwargs):
        # Yield two chunks then stop
        for delta in ["final ", "answer"]:
            yield type("Evt", (), {"choices": [type("Ch", (), {"delta": type("D", (), {"content": delta})()})()]})()

    async def fake_call_tool(name, arguments):
        return {"ok": True}

    def fake_select_client_and_model(provider, model):
        class Dummy:
            pass
        return Dummy(), "fake-model"

    monkeypatch.setattr("app.agent._chat_completions_create_async", fake_create_async)
    monkeypatch.setattr("app.agent._chat_completions_stream_async", fake_stream_async)
    monkeypatch.setattr("app.agent._call_mcp_tool", fake_call_tool)
    monkeypatch.setattr("app.agent._select_client_and_model", fake_select_client_and_model)

    ctx = {"tables": [{"name": "query_result", "columns": ["ts", "value"]}]}
    events = []
    async for evt in run_agent_stream("请用双折线图比较A和B", ctx):
        events.append(evt)
    # Extract sequence
    types = [e.get("type") for e in events]
    # Expect starts for three tools, chunks, tool_result for each, then chunks and done
    assert types.count("tool_call_started") == 3
    assert types.count("tool_result") == 3
    assert types[-1] == "done"
