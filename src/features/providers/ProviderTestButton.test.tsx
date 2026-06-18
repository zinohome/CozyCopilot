import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderTestButton } from "./ProviderTestButton";

const testMock = vi.fn();

vi.mock("./useProviders", () => ({
  useProviders: () => ({
    providers: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    test: testMock,
  }),
}));

describe("ProviderTestButton", () => {
  it("shows the initial Test connection button", () => {
    render(<ProviderTestButton baseUrl="https://x/v1" apiKey="sk-xxx" model="gpt-4o" />);
    expect(screen.getByRole("button", { name: /test connection/i })).toBeInTheDocument();
  });

  it("shows the latency and a success indicator when test returns ok:true", async () => {
    testMock.mockResolvedValueOnce({ ok: true, latencyMs: 234, models: ["gpt-4o"] });
    const user = userEvent.setup();
    render(<ProviderTestButton baseUrl="https://x/v1" apiKey="sk-xxx" model="gpt-4o" />);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(screen.getByText(/✓/)).toBeInTheDocument());
    expect(screen.getByText(/234ms/)).toBeInTheDocument();
    expect(screen.getByText(/1 models/)).toBeInTheDocument();
  });

  it("shows the error code and message when test returns ok:false", async () => {
    testMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "INVALID_API_KEY", message: "key rejected" },
    });
    const user = userEvent.setup();
    render(<ProviderTestButton baseUrl="https://x/v1" apiKey="sk-bad" model="gpt-4o" />);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(screen.getByText(/INVALID_API_KEY/)).toBeInTheDocument());
    expect(screen.getByText(/key rejected/)).toBeInTheDocument();
  });
});
