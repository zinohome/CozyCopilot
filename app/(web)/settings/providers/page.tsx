import { ProvidersClient } from "@/features/providers/ProvidersClient";

export default function ProvidersPage() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Custom LLM Providers</h1>
      <ProvidersClient />
    </main>
  );
}
