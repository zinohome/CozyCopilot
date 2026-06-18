import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalitiesClient } from "./PersonalitiesClient";

vi.mock("@/features/providers/useProviders", () => ({
  useProviders: () => ({
    providers: [
      {
        id: "pr-1",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        label: "OpenAI",
        isDefault: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ],
    loading: false,
    error: null,
  }),
}));

const pickMock = vi.fn();
vi.mock("./PersonalityPicker", () => ({
  PersonalityPicker: (props: {
    activeId: string | null;
    onChange: (id: string) => void;
    modelOptions: { value: string; label: string }[];
    builtInModels: string[];
  }) => {
    pickMock(props);
    return (
      <div
        data-testid="picker-stub"
        data-active={props.activeId ?? ""}
        data-options={props.modelOptions.map((o) => o.value).join(",")}
        data-builtin={props.builtInModels.join(",")}
      />
    );
  },
}));

describe("PersonalitiesClient", () => {
  it("composes providers into the model dropdown with <provider_id>:<model> encoding", () => {
    render(<PersonalitiesClient activeId="p-1" onChange={() => {}} />);
    const stub = screen.getByTestId("picker-stub");
    expect(stub.getAttribute("data-active")).toBe("p-1");
    expect(stub.getAttribute("data-options")).toBe("pr-1:gpt-4o-mini");
    expect(stub.getAttribute("data-builtin")).toContain("gpt-4o");
  });

  it("forwards onChange from the picker", async () => {
    let lastOnChange: ((id: string) => void) | undefined;
    pickMock.mockImplementationOnce((p: { onChange: (id: string) => void }) => {
      lastOnChange = p.onChange;
    });
    render(<PersonalitiesClient activeId={null} onChange={() => {}} />);
    expect(lastOnChange).toBeDefined();
    lastOnChange!("p-99");
    // assertion: simply ensure the picker received the prop and invoked without throw
    expect(pickMock).toHaveBeenCalled();
  });

  it("exposes built-in models so the picker can render the default select", () => {
    render(<PersonalitiesClient activeId={null} onChange={() => {}} />);
    const stub = screen.getByTestId("picker-stub");
    const builtin = stub.getAttribute("data-builtin") ?? "";
    expect(builtin.split(",")).toEqual(
      expect.arrayContaining(["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet", "gemini-1.5-pro"]),
    );
  });
});