"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "@/features/auth/LoginForm";
import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleSubmit(data: { email: string; password: string }) {
    const res = await fetch("/api/cozy/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!body.ok) {
      throw new Error(body.error?.userMessage ?? "登录失败");
    }
    setAuth(body.data.jwt, body.data.userId, body.data.email, body.data.role);
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-bg p-8 shadow-[var(--shadow-soft)]">
        <h1 className="mb-6 text-2xl font-bold text-accent">CozyCopilot</h1>
        <LoginForm onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
