import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the realtime voice module. We don't want to spin up LiveKit in
// unit tests; the panel itself has its own test coverage, and here we
// only care that the page wires the toggle and mount correctly.
const hangupMock = vi.fn().mockResolvedValue(undefined);
const useRealtimeMock = vi.fn(() => ({
  state: { kind: "idle" },
  start: vi.fn(),
  setMicEnabled: vi.fn(),
  hangup: hangupMock,
  lastSummary: null,
}));

vi.mock("@/features/voice/useRealtime", () => ({
  useRealtime: () => useRealtimeMock(),
}));

// Replace the heavy child components with light stand-ins so the test
// focuses on the realtime wiring rather than picker/provider behavior.
vi.mock("@/features/personalities", () => ({
  PersonalitiesClient: (props: { activeId: string | null }) => (
    <div data-testid="personality-picker" data-active={props.activeId ?? ""} />
  ),
}));

vi.mock("@/features/voice/RealtimePanel", () => ({
  RealtimePanel: (props: {
    sessionId: string;
    personalityId: string;
    onClose?: () => void | Promise<void>;
    onFallbackToText?: () => void | Promise<void>;
  }) => (
    <div
      data-testid="realtime-panel"
      data-session-id={props.sessionId}
      data-personality-id={props.personalityId}
    >
      <button type="button" data-testid="panel-close" onClick={() => void props.onClose?.()}>
        close
      </button>
      <button
        type="button"
        data-testid="panel-fallback"
        onClick={() => void props.onFallbackToText?.()}
      >
        fallback
      </button>
    </div>
  ),
}));

vi.mock("@/features/sessions", () => ({
  SessionsClient: (props: { activeId: string | null }) => (
    <div data-testid="sessions-client" data-active={props.activeId ?? ""} />
  ),
}));

// next/navigation's `useRouter` is called by the page's auth-redirect
// effect. Stub it so the test doesn't try to push to a real route.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";
import ChatPage from "./page";

function setupAuth(jwt: string) {
  useAuthStore.setState({ jwt, userId: "u-1", email: "a@b.c", role: "user" });
}

function setupSession(activeSessionId: string | null, activePersonalityId: string | null) {
  useSessionStore.setState({
    messages: [],
    streamingMessageId: null,
    activeSessionId,
    activePersonalityId,
  });
}

describe("ChatPage — realtime voice toggle (M5.8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hangupMock.mockResolvedValue(undefined);
    // Reset to "no session / no personality" so disabled-state tests
    // are explicit about what they're setting up.
    setupAuth("test-jwt");
    setupSession(null, null);
  });

  it("renders the realtime toggle button in the chat header", () => {
    render(<ChatPage />);
    expect(screen.getByTestId("realtime-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("realtime-toggle")).toHaveTextContent("语音通话");
  });

  it("disables the realtime toggle when there is no active session/personality", () => {
    setupSession(null, null);
    render(<ChatPage />);
    expect(screen.getByTestId("realtime-toggle")).toBeDisabled();
  });

  it("enables the realtime toggle when both session and personality are active", () => {
    setupSession("s-1", "p-1");
    render(<ChatPage />);
    expect(screen.getByTestId("realtime-toggle")).not.toBeDisabled();
  });

  it("opens RealtimePanel when the toggle is clicked and all guards pass", async () => {
    setupSession("s-1", "p-1");
    const user = userEvent.setup();
    render(<ChatPage />);

    // Panel is not mounted before the click.
    expect(screen.queryByTestId("realtime-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("realtime-toggle"));

    const panel = await screen.findByTestId("realtime-panel");
    expect(panel).toHaveAttribute("data-session-id", "s-1");
    expect(panel).toHaveAttribute("data-personality-id", "p-1");
  });

  it("does not mount RealtimePanel when the toggle is clicked but guards fail", async () => {
    // Active session + personality are required to mount the panel.
    setupSession(null, null);
    const user = userEvent.setup();
    render(<ChatPage />);

    // Button is disabled, so the click has no effect — but the guard
    // is also re-evaluated in the JSX, so even if a click slipped
    // through, the panel wouldn't mount.
    const toggle = screen.getByTestId("realtime-toggle");
    expect(toggle).toBeDisabled();
    await user.click(toggle).catch(() => undefined);

    expect(screen.queryByTestId("realtime-panel")).not.toBeInTheDocument();
  });

  it("calls hangup() and unmounts the panel when onClose is fired", async () => {
    setupSession("s-1", "p-1");
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(screen.getByTestId("realtime-toggle"));
    await screen.findByTestId("realtime-panel");

    await user.click(screen.getByTestId("panel-close"));

    await waitFor(() => {
      expect(screen.queryByTestId("realtime-panel")).not.toBeInTheDocument();
    });
    expect(hangupMock).toHaveBeenCalled();
  });

  it("calls hangup() and unmounts the panel when onFallbackToText is fired", async () => {
    setupSession("s-1", "p-1");
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(screen.getByTestId("realtime-toggle"));
    await screen.findByTestId("realtime-panel");

    await user.click(screen.getByTestId("panel-fallback"));

    await waitFor(() => {
      expect(screen.queryByTestId("realtime-panel")).not.toBeInTheDocument();
    });
    expect(hangupMock).toHaveBeenCalled();
  });
});
