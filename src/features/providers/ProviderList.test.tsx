import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";
import { ProviderList } from "./ProviderList";

vi.mock("./useProviders", () => ({
  useProviders: vi.fn(),
}));
import { useProviders } from "./useProviders";
const useProvidersMock = useProviders as unknown as ReturnType<typeof vi.fn>;

describe("ProviderList", () => {
  it("renders one row per provider", () => {
    useProvidersMock.mockReturnValue({
      providers: [
        {
          id: "pr-1",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
          label: "OpenAI",
          isDefault: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "pr-2",
          baseUrl: "https://x/v1",
          model: "claude-3",
          label: "Anthropic",
          isDefault: false,
          createdAt: "2026-01-02T00:00:00Z",
        },
        {
          id: "pr-3",
          baseUrl: "https://y/v1",
          model: "gemini-1.5",
          label: "Google",
          isDefault: false,
          createdAt: "2026-01-03T00:00:00Z",
        },
      ],
      loading: false,
      error: null,
      remove: vi.fn(),
    });
    render(<ProviderList onEdit={() => {}} />);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    // 3 rows × 5 cells + header row
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("shows the empty state when the list is empty", () => {
    useProvidersMock.mockReturnValue({
      providers: [],
      loading: false,
      error: null,
      remove: vi.fn(),
    });
    render(<ProviderList onEdit={() => {}} />);
    expect(screen.getByText(/no custom providers/i)).toBeInTheDocument();
  });

  it("shows the error message when error is set", () => {
    useProvidersMock.mockReturnValue({
      providers: [],
      loading: false,
      error: new ApiError("UNKNOWN", "something went wrong", true),
      remove: vi.fn(),
    });
    render(<ProviderList onEdit={() => {}} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
