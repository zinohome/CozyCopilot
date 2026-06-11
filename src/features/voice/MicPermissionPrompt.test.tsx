import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MicPermissionPrompt } from "./MicPermissionPrompt";

vi.mock("@/hooks/useCapability", () => ({
  useCapability: vi.fn(),
}));

vi.mock("@/lib/capabilities", () => ({
  requestMicrophonePermission: vi.fn(),
}));

import { useCapability } from "@/hooks/useCapability";
import { requestMicrophonePermission } from "@/lib/capabilities";

function mockCapability(overrides: Partial<{
  micPermission: "granted" | "denied" | "prompt" | "unsupported";
  isNativeApp: boolean;
  platform: string;
  loading: boolean;
  refresh: () => Promise<void>;
}> = {}) {
  const refresh = overrides.refresh ?? vi.fn().mockResolvedValue(undefined);
  (useCapability as Mock).mockReturnValue({
    micPermission: "prompt",
    isNativeApp: false,
    platform: "web",
    loading: false,
    refresh,
    ...overrides,
  });
  return { refresh };
}

describe("MicPermissionPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the loading state initially", () => {
    mockCapability({ loading: true });
    render(<MicPermissionPrompt />);
    expect(screen.getByText(/checking microphone status/i)).toBeInTheDocument();
  });

  it("renders the granted state with the 'Microphone ready' badge", () => {
    mockCapability({ micPermission: "granted" });
    render(<MicPermissionPrompt />);
    expect(screen.getByText(/microphone ready/i)).toBeInTheDocument();
    expect(screen.getByLabelText("mic-ready")).toBeInTheDocument();
  });

  it("renders the denied state with the 'blocked' message", () => {
    mockCapability({ micPermission: "denied" });
    render(<MicPermissionPrompt />);
    expect(
      screen.getByText(/microphone access is blocked/i),
    ).toBeInTheDocument();
  });

  it("renders the unsupported state with the fallback message", () => {
    mockCapability({ micPermission: "unsupported" });
    render(<MicPermissionPrompt />);
    expect(
      screen.getByText(/does not support voice input/i),
    ).toBeInTheDocument();
  });

  it("clicking 'Allow microphone' calls requestMicrophonePermission then refresh()", async () => {
    (requestMicrophonePermission as Mock).mockResolvedValue(true);
    const { refresh } = mockCapability({
      micPermission: "prompt",
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    const onGranted = vi.fn();
    const onDenied = vi.fn();
    render(<MicPermissionPrompt onGranted={onGranted} onDenied={onDenied} />);

    const button = screen.getByRole("button", { name: /allow microphone/i });
    await userEvent.click(button);

    expect(requestMicrophonePermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(onGranted).toHaveBeenCalledTimes(1);
    expect(onDenied).not.toHaveBeenCalled();
  });
});
