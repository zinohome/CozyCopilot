import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/errors";
import { SessionList } from "./SessionList";

const createMock = vi.fn();
const renameMock = vi.fn();
const removeMock = vi.fn();
const refreshMock = vi.fn();

const defaultHookReturn = {
  items: [] as ReturnType<typeof Object>,
  loading: false,
  error: null as ApiError | null,
  refresh: refreshMock,
  create: createMock,
  rename: renameMock,
  remove: removeMock,
};

vi.mock("./useSessions", () => ({
  useSessions: () => defaultHookReturn,
}));

beforeEach(() => {
  defaultHookReturn.items = [];
  defaultHookReturn.loading = false;
  defaultHookReturn.error = null;
  createMock.mockReset();
  renameMock.mockReset();
  removeMock.mockReset();
  refreshMock.mockReset();
});

describe("SessionList", () => {
  it("renders the new-session button and empty state", () => {
    render(<SessionList activeId={null} onSelect={() => {}} />);
    expect(screen.getByTestId("session-new")).toBeInTheDocument();
    expect(screen.getByText(/尚无会话/)).toBeInTheDocument();
  });

  it("renders one row per session and highlights the active row", () => {
    defaultHookReturn.items = [
      {
        id: "s-1",
        title: "Brainstorm",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-06-17T00:00:00Z",
      },
      {
        id: "s-2",
        title: undefined,
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-06-16T00:00:00Z",
      },
    ];
    render(<SessionList activeId="s-1" onSelect={() => {}} />);
    expect(screen.getByTestId("session-row-s-1")).toBeInTheDocument();
    expect(screen.getByTestId("session-row-s-2")).toBeInTheDocument();
    expect(screen.getByText("Brainstorm")).toBeInTheDocument();
    expect(screen.getByText("未命名会话")).toBeInTheDocument();
    expect(screen.getByTestId("session-row-s-1").className).toMatch(/border-accent/);
  });

  it("calls create() and onSelect when the new button is clicked", async () => {
    createMock.mockResolvedValueOnce({
      id: "s-new",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SessionList activeId={null} onSelect={onSelect} />);
    await user.click(screen.getByTestId("session-new"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("s-new"));
  });

  it("calls onSelect when a session row is clicked", async () => {
    defaultHookReturn.items = [
      {
        id: "s-1",
        title: "x",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-06-17T00:00:00Z",
      },
    ];
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SessionList activeId={null} onSelect={onSelect} />);
    await user.click(screen.getByTestId("session-select-s-1"));
    expect(onSelect).toHaveBeenCalledWith("s-1");
  });

  it("renames inline and commits via Enter", async () => {
    defaultHookReturn.items = [
      {
        id: "s-1",
        title: "Old",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-06-17T00:00:00Z",
      },
    ];
    renameMock.mockResolvedValueOnce({ id: "s-1", title: "New" });
    const user = userEvent.setup();
    render(<SessionList activeId={null} onSelect={() => {}} />);
    await user.click(screen.getByTestId("session-rename-s-1"));
    const input = screen.getByDisplayValue("Old");
    await user.clear(input);
    await user.type(input, "New{enter}");
    await waitFor(() => expect(renameMock).toHaveBeenCalledWith("s-1", "New"));
  });

  it("skips the rename when the new title is empty or unchanged", async () => {
    defaultHookReturn.items = [
      {
        id: "s-1",
        title: "Old",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-06-17T00:00:00Z",
      },
    ];
    const user = userEvent.setup();
    render(<SessionList activeId={null} onSelect={() => {}} />);
    await user.click(screen.getByTestId("session-rename-s-1"));
    const input = screen.getByDisplayValue("Old");
    await user.clear(input);
    await user.type(input, "{enter}");
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("calls remove() when the user confirms delete", async () => {
    defaultHookReturn.items = [
      {
        id: "s-1",
        title: "Doomed",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-06-17T00:00:00Z",
      },
    ];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<SessionList activeId={null} onSelect={() => {}} />);
    await user.click(screen.getByTestId("session-delete-s-1"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalledWith("s-1");
    confirmSpy.mockRestore();
  });

  it("does NOT call remove() when the user cancels the delete confirm", async () => {
    defaultHookReturn.items = [
      {
        id: "s-1",
        title: "Keep",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-06-17T00:00:00Z",
      },
    ];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<SessionList activeId={null} onSelect={() => {}} />);
    await user.click(screen.getByTestId("session-delete-s-1"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("shows the loading skeleton", () => {
    defaultHookReturn.loading = true;
    render(<SessionList activeId={null} onSelect={() => {}} />);
    expect(screen.getByTestId("sessions-loading")).toBeInTheDocument();
  });

  it("shows the error state with a retry button", async () => {
    defaultHookReturn.error = new ApiError("UNKNOWN", "boom", true);
    const user = userEvent.setup();
    render(<SessionList activeId={null} onSelect={() => {}} />);
    expect(screen.getByTestId("sessions-error")).toHaveTextContent("boom");
    await user.click(screen.getByRole("button", { name: /重试/ }));
    expect(refreshMock).toHaveBeenCalled();
  });
});