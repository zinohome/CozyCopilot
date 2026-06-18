import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToolCalls } from "./useToolCalls";

describe("useToolCalls", () => {
  it("starts with an empty tools map", () => {
    const { result } = renderHook(() => useToolCalls());
    expect(result.current.tools).toEqual({});
  });

  it("ingestSSE adds a tool on tool_call and flips to completed on tool_result", () => {
    const { result } = renderHook(() => useToolCalls());

    act(() => {
      result.current.ingestSSE({
        type: "tool_call",
        id: "a",
        name: "search",
        arguments: { q: "SSE" },
      });
    });
    expect(result.current.tools).toEqual({
      a: {
        id: "a",
        name: "search",
        arguments: { q: "SSE" },
        status: "running",
      },
    });

    act(() => {
      result.current.ingestSSE({ type: "tool_result", id: "a", result: { ok: true } });
    });
    expect(result.current.tools.a).toEqual({
      id: "a",
      name: "search",
      arguments: { q: "SSE" },
      status: "completed",
      result: { ok: true },
    });
  });

  it("ingestWS mirrors ingestSSE behavior", () => {
    const { result } = renderHook(() => useToolCalls());

    act(() => {
      result.current.ingestWS({
        type: "tool_call",
        id: "b",
        name: "lookup",
        arguments: { id: 7 },
      });
    });
    expect(result.current.tools.b?.status).toBe("running");

    act(() => {
      result.current.ingestWS({ type: "tool_result", id: "b", result: 42 });
    });
    expect(result.current.tools.b).toEqual({
      id: "b",
      name: "lookup",
      arguments: { id: 7 },
      status: "completed",
      result: 42,
    });
  });

  it("ignores non-tool SSE events (deltas/done/error) without mutating state", () => {
    const { result } = renderHook(() => useToolCalls());

    act(() => {
      result.current.ingestSSE({ type: "delta", content: "hello" });
      result.current.ingestSSE({ type: "done" });
      result.current.ingestSSE({ type: "error", code: "X", message: "boom" });
    });
    expect(result.current.tools).toEqual({});
  });

  it("reset() clears the map", () => {
    const { result } = renderHook(() => useToolCalls());

    act(() => {
      result.current.ingestSSE({
        type: "tool_call",
        id: "c",
        name: "x",
        arguments: {},
      });
    });
    expect(Object.keys(result.current.tools)).toEqual(["c"]);

    act(() => {
      result.current.reset();
    });
    expect(result.current.tools).toEqual({});
  });
});
