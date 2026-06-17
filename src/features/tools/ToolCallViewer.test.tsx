import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolCallViewer, type ToolCallData } from "./ToolCallViewer";

function baseTool(overrides: Partial<ToolCallData> = {}): ToolCallData {
  return {
    id: "t1",
    name: "search_docs",
    arguments: { query: "SSE", limit: 5 },
    status: "running",
    ...overrides,
  };
}

describe("ToolCallViewer", () => {
  it("renders the tool name and a collapsed state initially", () => {
    render(<ToolCallViewer tool={baseTool()} />);
    expect(screen.getByTestId("tool-name-t1").textContent).toContain("search_docs");
    // The body section is not rendered while collapsed.
    expect(screen.queryByTestId("tool-body-t1")).toBeNull();
    expect(screen.getByTestId("tool-call-t1")).toHaveAttribute("aria-expanded", "false");
  });

  it("expands to show the arguments formatted as JSON when the header is clicked", async () => {
    const user = userEvent.setup();
    render(<ToolCallViewer tool={baseTool()} />);

    await user.click(screen.getByTestId("tool-call-t1"));

    const body = screen.getByTestId("tool-body-t1");
    expect(body).toBeInTheDocument();
    const args = screen.getByTestId("tool-args-t1");
    // Pretty-printed JSON, 2-space indent.
    expect(args.textContent).toBe('{\n  "query": "SSE",\n  "limit": 5\n}');
    expect(screen.getByTestId("tool-call-t1")).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the Running… status when result is undefined and status is running", async () => {
    const user = userEvent.setup();
    render(<ToolCallViewer tool={baseTool({ status: "running" })} />);

    await user.click(screen.getByTestId("tool-call-t1"));
    expect(screen.getByTestId("tool-running-t1")).toBeInTheDocument();
    expect(screen.queryByTestId("tool-result-t1")).toBeNull();
  });

  it("shows the result section when result is provided and status is completed", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallViewer
        tool={baseTool({
          status: "completed",
          result: { ok: true, count: 2 },
        })}
      />,
    );

    await user.click(screen.getByTestId("tool-call-t1"));
    const result = screen.getByTestId("tool-result-t1");
    expect(result.textContent).toBe('{\n  "ok": true,\n  "count": 2\n}');
    expect(screen.queryByTestId("tool-running-t1")).toBeNull();
  });

  it("uses the correct status indicator color per status", () => {
    const { rerender } = render(<ToolCallViewer tool={baseTool({ status: "running" })} />);
    let dot = screen.getByTestId("tool-status-t1");
    expect(dot.className).toContain("bg-purple-500");
    expect(dot.className).toContain("animate-pulse");

    rerender(<ToolCallViewer tool={baseTool({ id: "t2", status: "completed" })} />);
    dot = screen.getByTestId("tool-status-t2");
    expect(dot.className).toContain("bg-green-500");
    expect(dot.className).not.toContain("animate-pulse");

    rerender(<ToolCallViewer tool={baseTool({ id: "t3", status: "failed" })} />);
    dot = screen.getByTestId("tool-status-t3");
    expect(dot.className).toContain("bg-red-500");
  });

  it("collapses and hides args + result when the header is clicked again", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallViewer
        tool={baseTool({ status: "completed", result: { ok: true } })}
      />,
    );

    await user.click(screen.getByTestId("tool-call-t1"));
    expect(screen.getByTestId("tool-body-t1")).toBeInTheDocument();

    await user.click(screen.getByTestId("tool-call-t1"));
    expect(screen.queryByTestId("tool-body-t1")).toBeNull();
    expect(screen.queryByTestId("tool-args-t1")).toBeNull();
    expect(screen.queryByTestId("tool-result-t1")).toBeNull();
    expect(screen.getByTestId("tool-call-t1")).toHaveAttribute("aria-expanded", "false");
  });
});
