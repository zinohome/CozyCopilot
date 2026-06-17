"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { useProviders, type Provider } from "./useProviders";

export function ProviderForm({
  provider,
  onSaved,
  onCancel,
}: {
  provider?: Provider;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { create, update } = useProviders();
  const [baseUrl, setBaseUrl] = useState(
    provider?.baseUrl ?? "https://api.openai.com/v1",
  );
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(provider?.model ?? "");
  const [label, setLabel] = useState(provider?.label ?? "");
  const [isDefault, setIsDefault] = useState(provider?.isDefault ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (provider) {
        await update(provider.id, { baseUrl, model, label, isDefault });
      } else {
        await create({ baseUrl, apiKey, model, label, isDefault });
      }
      onSaved();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Save failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="provider-form">
      <div>
        <label htmlFor="provider-label" className="block text-sm font-medium text-neutral-700">
          Label
        </label>
        <input
          id="provider-label"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="OpenAI Production"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="provider-base-url" className="block text-sm font-medium text-neutral-700">
          Base URL
        </label>
        <input
          id="provider-base-url"
          required
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
        />
      </div>
      {!provider && (
        <div>
          <label htmlFor="provider-api-key" className="block text-sm font-medium text-neutral-700">
            API Key
          </label>
          <input
            id="provider-api-key"
            required
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Stored encrypted on the server; not retrievable after save.
          </p>
        </div>
      )}
      <div>
        <label htmlFor="provider-model" className="block text-sm font-medium text-neutral-700">
          Model
        </label>
        <input
          id="provider-model"
          required
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        Use as default provider
      </label>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-300 px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {submitting ? "Saving…" : provider ? "Save changes" : "Add provider"}
        </button>
      </div>
    </form>
  );
}
