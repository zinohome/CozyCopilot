import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { makeZustandStorage } from "@/lib/storage";

export type UserRole = "user" | "admin" | "designer";

export interface AuthState {
  jwt: string;
  userId: string;
  email: string;
  role: UserRole | "";
  setAuth: (jwt: string, userId: string, email: string, role: UserRole) => void;
  logout: () => void;
}

// Storage is platform-agnostic via lib/storage; on web this maps to
// localStorage, on Tauri to tauri-plugin-store (M3.8), on Capacitor to
// @capacitor/preferences (M3.9).
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
    {
      name: "cozycopilot-auth",
      storage: createJSONStorage(() => makeZustandStorage()),
    },
  ),
);
