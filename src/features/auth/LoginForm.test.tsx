import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("calls onSubmit with email + password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/邮箱/i), "alice@test.com");
    await userEvent.type(screen.getByLabelText(/密码/i), "pw1234");
    await userEvent.click(screen.getByRole("button", { name: /登录/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      email: "alice@test.com",
      password: "pw1234",
    });
  });

  it("disables button while submitting", async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockImplementation(
      () => new Promise<void>((r) => (resolveSubmit = r)),
    );
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/邮箱/i), "a@b.c");
    await userEvent.type(screen.getByLabelText(/密码/i), "x");
    const button = screen.getByRole("button", { name: /登录/i });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    resolveSubmit();
  });
});
