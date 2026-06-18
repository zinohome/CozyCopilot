import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { VoiceButton } from "./VoiceButton";
import type { UseVoiceSend, VoiceSendState } from "./useVoiceSend";

// We don't render the real `useVoiceSend` here — that hook is covered in
// `useVoiceSend.test.ts`. Instead, inject a stub so we can assert the
// pointer/keyboard bindings in isolation.
function makeStub(initial: VoiceSendState = { kind: "idle" }): UseVoiceSend & {
  _state: VoiceSendState;
  _setState: (s: VoiceSendState) => void;
  startRecording: ReturnType<typeof vi.fn>;
  stopAndSend: ReturnType<typeof vi.fn>;
  cancelRecording: ReturnType<typeof vi.fn>;
} {
  const stub = {
    _state: initial,
    _setState: (s: VoiceSendState) => {
      stub._state = s;
    },
    get state() {
      return stub._state;
    },
    startRecording: vi.fn(async () => {
      stub._state = { kind: "recording" };
    }),
    stopAndSend: vi.fn(async () => {
      stub._state = { kind: "idle" };
      return null;
    }),
    cancelRecording: vi.fn(() => {
      stub._state = { kind: "idle" };
    }),
  } as UseVoiceSend & {
    _state: VoiceSendState;
    _setState: (s: VoiceSendState) => void;
    startRecording: ReturnType<typeof vi.fn>;
    stopAndSend: ReturnType<typeof vi.fn>;
    cancelRecording: ReturnType<typeof vi.fn>;
  };
  return stub;
}

// jsdom doesn't implement `PointerEvent`, so `fireEvent.pointerDown` falls
// back to dispatching a plain `MouseEvent`. Our handlers read `e.button` and
// `e.pointerId` — we set both so the production code path matches the real
// browser. `MouseEvent` already carries `button`; `pointerId` we add via
// Object.defineProperty because the constructor doesn't expose it.
//
// Note: React 19's `onPointerLeave` is mapped to the native `pointerout`
// event (and `onPointerEnter` to `pointerover`). Dispatching `pointerleave`
// directly does NOT trigger the React handler — the test must use
// `pointerout` to exercise the leave path.
function dispatchPointer(target: Element, type: string, init: { button?: number; pointerId?: number }) {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button ?? 0,
  });
  if (init.pointerId !== undefined) {
    Object.defineProperty(ev, "pointerId", { value: init.pointerId });
  }
  act(() => {
    target.dispatchEvent(ev);
  });
}

describe("VoiceButton", () => {
  it("renders the mic icon in idle state when both ids are set", () => {
    const stub = makeStub();
    const hookFactory = vi.fn(() => stub);
    render(
      <VoiceButton
        sessionId="s1"
        personalityId="p1"
        useVoiceSendHook={hookFactory}
      />,
    );
    const btn = screen.getByRole("button", { name: /voice-input/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("title", "按住说话");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).not.toBeDisabled();
    expect(hookFactory).toHaveBeenCalledWith({ sessionId: "s1", personalityId: "p1" });
  });

  it("is disabled when either sessionId or personalityId is missing", () => {
    const stub = makeStub();
    const { rerender } = render(
      <VoiceButton sessionId={null} personalityId="p1" useVoiceSendHook={() => stub} />,
    );
    expect(screen.getByRole("button", { name: /voice-input/i })).toBeDisabled();

    rerender(
      <VoiceButton sessionId="s1" personalityId={null} useVoiceSendHook={() => stub} />,
    );
    expect(screen.getByRole("button", { name: /voice-input/i })).toBeDisabled();
  });

  it("onPointerDown triggers startRecording; onPointerUp triggers stopAndSend", () => {
    const stub = makeStub();
    render(
      <VoiceButton
        sessionId="s1"
        personalityId="p1"
        useVoiceSendHook={() => stub}
      />,
    );
    const btn = screen.getByRole("button", { name: /voice-input/i });

    dispatchPointer(btn, "pointerdown", { button: 0, pointerId: 1 });
    expect(stub.startRecording).toHaveBeenCalledTimes(1);

    dispatchPointer(btn, "pointerup", { button: 0, pointerId: 1 });
    expect(stub.stopAndSend).toHaveBeenCalledTimes(1);
  });

  it("onPointerLeave also triggers stopAndSend (dragged-off release)", () => {
    const stub = makeStub();
    render(
      <VoiceButton
        sessionId="s1"
        personalityId="p1"
        useVoiceSendHook={() => stub}
      />,
    );
    const btn = screen.getByRole("button", { name: /voice-input/i });

    dispatchPointer(btn, "pointerdown", { button: 0, pointerId: 1 });
    // React 19 maps `onPointerLeave` to the native `pointerout` event;
    // dispatching `pointerleave` here would bypass the React handler.
    dispatchPointer(btn, "pointerout", { button: 0, pointerId: 1 });
    expect(stub.cancelRecording).not.toHaveBeenCalled();
    expect(stub.stopAndSend).toHaveBeenCalledTimes(1);
  });

  it("onPointerCancel triggers cancelRecording instead of stopAndSend", () => {
    const stub = makeStub();
    render(
      <VoiceButton
        sessionId="s1"
        personalityId="p1"
        useVoiceSendHook={() => stub}
      />,
    );
    const btn = screen.getByRole("button", { name: /voice-input/i });

    dispatchPointer(btn, "pointerdown", { button: 0, pointerId: 1 });
    dispatchPointer(btn, "pointercancel", { button: 0, pointerId: 1 });
    expect(stub.cancelRecording).toHaveBeenCalledTimes(1);
    expect(stub.stopAndSend).not.toHaveBeenCalled();
  });

  it("Space key (focused) triggers startRecording on keydown and stopAndSend on keyup", () => {
    const stub = makeStub();
    render(
      <VoiceButton
        sessionId="s1"
        personalityId="p1"
        useVoiceSendHook={() => stub}
      />,
    );
    const btn = screen.getByRole("button", { name: /voice-input/i });

    fireEvent.keyDown(btn, { key: " " });
    expect(stub.startRecording).toHaveBeenCalledTimes(1);

    fireEvent.keyUp(btn, { key: " " });
    expect(stub.stopAndSend).toHaveBeenCalledTimes(1);
  });

  it("reflects the recording state in aria-pressed and the tooltip text", () => {
    const stub = makeStub({ kind: "recording" });
    render(
      <VoiceButton
        sessionId="s1"
        personalityId="p1"
        useVoiceSendHook={() => stub}
      />,
    );
    const btn = screen.getByRole("button", { name: /voice-input/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveAttribute("title", "正在录音…松开发送");
    expect(btn.getAttribute("data-state")).toBe("recording");
  });
});