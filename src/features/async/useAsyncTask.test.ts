import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAuthStore } from "@/stores/auth";

// All mock state and the WSClient shim are hoisted to the top of the file via
// `vi.hoisted` so that `vi.mock(...)` factories (which Vitest hoists above
// the imports) can reference them without TDZ errors.
//
// The `connectBehavior` flag controls what `MockWSClient.connect()` returns:
//   - "resolve": resolve immediately
//   - "pending": never resolve
//   - "reject":  reject immediately
const mock = vi.hoisted(() => {
  const handlers = new Map<string, Set<(ev: unknown) => void>>();
  const instances: Array<{
    url: string;
    token: string;
    connect: () => Promise<void>;
    close: () => void;
  }> = [];
  let connectBehavior: "resolve" | "pending" | "reject" = "resolve";

  class FakeWSClient {
    public url: string;
    public token: string;
    public connect: () => Promise<void>;
    public close: () => void;

    constructor(opts: { url: string; token: string }) {
      this.url = opts.url;
      this.token = opts.token;
      this.connect = vi.fn().mockImplementation(() => {
        if (connectBehavior === "resolve") return Promise.resolve();
        if (connectBehavior === "reject") return Promise.reject(new Error("ws down"));
        return new Promise<void>(() => {
          /* never resolves */
        });
      });
      this.close = vi.fn(() => {
        handlers.clear();
      });
      instances.push(this);
    }

    on(type: string, handler: (ev: unknown) => void): () => void {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
      return () => {
        set!.delete(handler);
      };
    }
  }

  return {
    handlers,
    instances,
    setConnectBehavior: (b: "resolve" | "pending" | "reject") => {
      connectBehavior = b;
    },
    MockWSClient: FakeWSClient,
  };
});

vi.mock("@/lib/api/ws", () => ({
  WSClient: mock.MockWSClient,
}));

// Mock the notify hook so we can assert send() is called.
const mockSend = vi.fn();
vi.mock("@/hooks/useNotify", () => ({
  useNotify: () => ({
    permission: "granted",
    busy: false,
    request: vi.fn().mockResolvedValue("granted"),
    send: mockSend,
  }),
}));

// Mock the apiFetch helper so we can drive polling without hitting the network.
const apiFetchMock = vi.fn();
vi.mock("./apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { useAsyncTask, type AsyncTask } from "./useAsyncTask";

function setupAuth() {
  useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "a@b.c", role: "user" });
}

function fireWS(type: string, payload: unknown) {
  const set = mock.handlers.get(type);
  if (set) for (const h of set) h(payload);
}

beforeEach(() => {
  mock.handlers.clear();
  mock.instances.length = 0;
  mockSend.mockReset();
  apiFetchMock.mockReset();
  mock.setConnectBehavior("resolve");
  setupAuth();
});

afterEach(() => {
  useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
  vi.useRealTimers();
});

describe("useAsyncTask", () => {
  it("initial state: task is null, error is null", () => {
    const { result } = renderHook(() => useAsyncTask());
    expect(result.current.task).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
  });

  it("start(taskId) triggers WS connect with the right URL and token", () => {
    const { result } = renderHook(() => useAsyncTask());

    act(() => {
      result.current.start("task-123");
    });

    expect(mock.instances).toHaveLength(1);
    const ws = mock.instances[0];
    expect(ws.url).toContain("/api/ws/chat");
    expect(ws.token).toBe("test-jwt");
    expect(ws.connect).toHaveBeenCalledTimes(1);
    // Initial optimistic state.
    expect(result.current.task?.id).toBe("task-123");
    expect(result.current.task?.status).toBe("pending");
  });

  it("on task_completed WS event, task.status becomes 'completed'", async () => {
    const { result } = renderHook(() => useAsyncTask());

    act(() => {
      result.current.start("task-abc");
    });

    // connect() resolved; let microtasks flush so handlers are wired up.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireWS("task_completed", {
        type: "task_completed",
        taskId: "task-abc",
        result: "all done",
      });
    });

    expect(result.current.task?.status).toBe("completed");
    expect(result.current.task?.result).toBe("all done");
    expect(result.current.task?.completedAt).toBeDefined();
  });

  it("on task_completed WS event, notify.send is called once with title+body", async () => {
    const { result } = renderHook(() => useAsyncTask());

    act(() => {
      result.current.start("task-notify");
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mockSend.mockClear();
    await act(async () => {
      fireWS("task_completed", {
        type: "task_completed",
        taskId: "task-notify",
        result: "result body",
      });
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      title: "Task completed",
      body: "result body",
    });
  });

  it("on WS connection failure, polling starts (setInterval)", async () => {
    vi.useFakeTimers();
    // Switch the connect() shim to reject BEFORE the hook is mounted so
    // the .catch() fallback in connectWS() fires.
    mock.setConnectBehavior("reject");
    apiFetchMock.mockResolvedValue({
      id: "task-polling",
      sessionId: "s-1",
      status: "pending",
      createdAt: new Date().toISOString(),
    } satisfies AsyncTask);

    const { result } = renderHook(() => useAsyncTask({ pollIntervalMs: 1000 }));

    act(() => {
      result.current.start("task-polling");
    });

    // The connect() promise rejection triggers startPolling. Flush
    // microtasks (so the .catch() chain runs) — but DO NOT use
    // `runAllTimersAsync` here, that loops the setInterval forever.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiFetchMock).toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/cozy/chat/async?taskId=task-polling", {
      token: "test-jwt",
    });
    const callsAfterStart = apiFetchMock.mock.calls.length;

    // Advance the fake timer one step — setInterval should fire one more fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(apiFetchMock.mock.calls.length).toBeGreaterThan(callsAfterStart);
  });

  it("cancel() stops both WS and polling", async () => {
    vi.useFakeTimers();
    mock.setConnectBehavior("reject");
    apiFetchMock.mockResolvedValue({
      id: "task-cancel",
      sessionId: "s-1",
      status: "running",
      createdAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useAsyncTask({ pollIntervalMs: 500 }));

    act(() => {
      result.current.start("task-cancel");
    });

    // Drain the .catch() chain so startPolling has actually scheduled.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Polling is active: at least one apiFetch call has happened.
    expect(apiFetchMock.mock.calls.length).toBeGreaterThan(0);

    const last = mock.instances[0];

    // Cancel.
    act(() => {
      result.current.cancel();
    });

    // WS.close() was called on the live WS instance.
    expect(last.close).toHaveBeenCalled();

    // Advancing the timer should produce no further fetches.
    apiFetchMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
