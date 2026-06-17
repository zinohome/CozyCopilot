"use client";

import { useProviders } from "./useProviders";

export function ProviderList({ onEdit }: { onEdit: (id: string) => void }) {
  const { providers, loading, error, remove } = useProviders();

  if (loading) {
    return <div className="p-4 text-sm text-neutral-500">Loading…</div>;
  }
  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error: {error.message}
      </div>
    );
  }
  if (providers.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        No custom providers. Add one to use a non-default LLM.
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-neutral-600">
          <th className="p-2">Label</th>
          <th className="p-2">Base URL</th>
          <th className="p-2">Model</th>
          <th className="p-2">Default</th>
          <th className="p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.id} className="border-b border-neutral-100">
            <td className="p-2 font-medium">
              {p.label}
              {p.isDefault && <span className="ml-2 text-xs text-orange-600">★</span>}
            </td>
            <td className="p-2 font-mono text-xs text-neutral-700">{p.baseUrl}</td>
            <td className="p-2 font-mono text-xs">{p.model}</td>
            <td className="p-2">{p.isDefault ? "Yes" : "No"}</td>
            <td className="p-2 flex gap-3">
              <button
                type="button"
                onClick={() => onEdit(p.id)}
                className="text-orange-600 hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="text-red-600 hover:underline"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
