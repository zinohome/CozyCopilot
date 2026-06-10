import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "user" | "admin" | "designer";

export interface AuthState {
  jwt: string;
  userId: string;
  email: string;
  role: UserRole | "";
  setAuth: (jwt: string, userId: string, email: string, role: UserRole) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      jwt: "",
      userId: "",
      email: "",
      role: "",
      setAuth: (jwt, userId, email, role) => set({ jwt, userId, email, role }),
      logout: () => set({ jwt: "", userId: "", email: "", role: "" }),
    }),
    { name: "cozycopilot-auth" },
  ),
);
