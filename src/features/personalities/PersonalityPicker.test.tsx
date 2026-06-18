import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonalityPicker } from "./PersonalityPicker";

const createMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("./usePersonalities", () => ({
  usePersonalities: () => ({
    items: [
      {
        id: "p-1",
        name: "Coach",
        systemPrompt: "be a coach",
        model: "gpt-4o",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "p-2",
        name: "Coder",
        systemPrompt: "write code",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ],
    loading: false,
    error: null,
    refresh: refreshMock,
    create: createMock,
  }),
}));

describe("PersonalityPicker", () => {
  it("shows the active personality name on the trigger", () => {
    render(<PersonalityPicker activeId="p-1" onChange={() => {}} modelOptions={[]} />);
    expect(screen.getByTestId("personality-trigger")).toHaveTextContent("Coach");
  });

  it("shows placeholder text when no active personality", () => {
    render(<PersonalityPicker activeId={null} onChange={() => {}} modelOptions={[]} />);
    expect(screen.getByTestId("personality-trigger")).toHaveTextContent("选择人格");
  });

  it("opens the dropdown and lists personalities", async () => {
    const user = userEvent.setup();
    render(<PersonalityPicker activeId={null} onChange={() => {}} modelOptions={[]} />);
    await user.click(screen.getByTestId("personality-trigger"));
    expect(screen.getByTestId("personality-option-p-1")).toHaveTextContent("Coach");
    expect(screen.getByTestId("personality-option-p-2")).toHaveTextContent("Coder");
  });

  it("calls onChange when a personality is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonalityPicker activeId={null} onChange={onChange} modelOptions={[]} />);
    await user.click(screen.getByTestId("personality-trigger"));
    await user.click(screen.getByTestId("personality-option-p-2"));
    expect(onChange).toHaveBeenCalledWith("p-2");
  });

  it("shows the new-personality button at the bottom", async () => {
    const user = userEvent.setup();
    render(<PersonalityPicker activeId={null} onChange={() => {}} modelOptions={[]} />);
    await user.click(screen.getByTestId("personality-trigger"));
    expect(screen.getByTestId("personality-new")).toBeInTheDocument();
  });

  it("opens inline create form and shows model options", async () => {
    const user = userEvent.setup();
    render(
      <PersonalityPicker
        activeId={null}
        onChange={() => {}}
        modelOptions={[
          { value: "pr-1:gpt-4o-mini", label: "OpenAI · gpt-4o-mini" },
        ]}
        builtInModels={["gpt-4o"]}
      />,
    );
    await user.click(screen.getByTestId("personality-trigger"));
    await user.click(screen.getByTestId("personality-new"));
    const form = screen.getByTestId("personality-create-form");
    expect(form).toBeInTheDocument();
    expect(screen.getByPlaceholderText("名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("系统提示词")).toBeInTheDocument();
  });

  it("submits the inline form and calls create", async () => {
    createMock.mockResolvedValueOnce({
      id: "p-new",
      name: "Helper",
      systemPrompt: "help me",
      createdAt: "2026-02-01T00:00:00Z",
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PersonalityPicker
        activeId={null}
        onChange={onChange}
        modelOptions={[]}
        builtInModels={["gpt-4o"]}
      />,
    );
    await user.click(screen.getByTestId("personality-trigger"));
    await user.click(screen.getByTestId("personality-new"));
    await user.type(screen.getByPlaceholderText("名称"), "Helper");
    await user.type(screen.getByPlaceholderText("系统提示词"), "help me");
    await user.click(screen.getByRole("button", { name: /创建/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("p-new"));
    expect(createMock).toHaveBeenCalledWith({
      name: "Helper",
      systemPrompt: "help me",
    });
  });
});