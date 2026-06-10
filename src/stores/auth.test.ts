import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
    localStorage.clear();
  });

  it("setAuth stores all fields", () => {
    useAuthStore.getState().setAuth("jwt-1", "u-1", "alice@test.com", "user");
    const state = useAuthStore.getState();
    expect(state.jwt).toBe("jwt-1");
    expect(state.userId).toBe("u-1");
    expect(state.email).toBe("alice@test.com");
    expect(state.role).toBe("user");
  });

  it("logout clears all fields", () => {
    useAuthStore.getState().setAuth("jwt-1", "u-1", "a@b.c", "user");
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.jwt).toBe("");
    expect(state.userId).toBe("");
  });
});
