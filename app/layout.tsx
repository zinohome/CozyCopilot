import type { Metadata } from "next";
import "../src/styles/globals.css";

export const metadata: Metadata = {
  title: "CozyCopilot",
  description: "A warmer AI chat experience",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
