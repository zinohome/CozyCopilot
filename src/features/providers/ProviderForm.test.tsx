import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderForm } from "./ProviderForm";

const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock("./useProviders", () => ({
  useProviders: () => ({
    providers: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    create: createMock,
    update: updateMock,
    remove: vi.fn(),
    test: vi.fn(),
  }),
}));

describe("ProviderForm", () => {
  it("renders all required fields for a new provider", () => {
    render(<ProviderForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/label/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^model$/i)).toBeInTheDocument();
  });

  it("hides the api key field when editing an existing provider", () => {
    const existing = {
      id: "pr-1",
      baseUrl: "https://x/v1",
      model: "gpt-4o",
      label: "OpenAI",
      isDefault: true,
      createdAt: "2026-01-01T00:00:00Z",
    };
    render(<ProviderForm provider={existing} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    // Other fields are pre-filled
    expect(screen.getByLabelText(/label/i)).toHaveValue("OpenAI");
  });

  it("calls onSaved after a successful submit", async () => {
    createMock.mockResolvedValueOnce({
      id: "pr-new",
      baseUrl: "https://x/v1",
      model: "gpt-4o",
      label: "NewOne",
      isDefault: false,
      createdAt: "2026-02-01T00:00:00Z",
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<ProviderForm onSaved={onSaved} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/label/i), "NewOne");
    // baseUrl has a default placeholder value, clear it before typing
    await user.clear(screen.getByLabelText(/base url/i));
    await user.type(screen.getByLabelText(/base url/i), "https://x/v1");
    await user.type(screen.getByLabelText(/api key/i), "sk-xxx");
    await user.type(screen.getByLabelText(/^model$/i), "gpt-4o");
    await user.click(screen.getByRole("button", { name: /add provider/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(createMock).toHaveBeenCalledWith({
      baseUrl: "https://x/v1",
      apiKey: "sk-xxx",
      model: "gpt-4o",
      label: "NewOne",
      isDefault: false,
    });
  });
});
