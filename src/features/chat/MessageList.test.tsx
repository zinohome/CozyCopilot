import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
  it("renders user and assistant messages", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "user", content: "hi", status: "done" },
          { id: "2", role: "assistant", content: "hello", status: "done" },
        ]}
      />,
    );
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows streaming indicator on streaming assistant message", () => {
    render(
      <MessageList
        messages={[
          { id: "2", role: "assistant", content: "hel", status: "streaming" },
        ]}
      />,
    );
    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();
  });
});
