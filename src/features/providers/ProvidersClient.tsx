"use client";

import { useState } from "react";
import { ProviderForm } from "./ProviderForm";
import { ProviderList } from "./ProviderList";
import { ProviderTestButton } from "./ProviderTestButton";
import { useProviders } from "./useProviders";

/**
 * Page-level client component that owns the providers UI state.
 *
 * The providers list comes from the hook; the form operates against a
 * captured snapshot of an existing provider when editing. The edit flow
 * passes a stub Provider down to the form (the form pre-fills baseUrl,
 * label, etc. from `provider`); the actual save goes through the hook's
 * `update(id, …)` so the list refreshes after a successful save.
 *
 * For v1.0 we keep the "edit" interaction minimal — the form already has
 * pre-fill logic and the hook does the optimistic list refresh; a v2
 * follow-up can re-fetch the single provider before opening the form.
 */
export function ProvidersClient() {
  const { providers, loading } = useProviders();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const editing = editingId ? providers.find((p) => p.id === editingId) : undefined;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {!showForm && !editingId && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            + Add provider
          </button>
        )}
      </div>
      {showForm && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-medium">New provider</h2>
          <ProviderForm onSaved={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <ProviderTestPlaceholder />
          </div>
        </div>
      )}
      {editingId && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-medium">
            Edit provider{editing ? `: ${editing.label}` : ` (id: ${editingId})`}
          </h2>
          {editing ? (
            <>
              <ProviderForm
                provider={editing}
                onSaved={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <p className="mb-2 text-xs text-neutral-500">
                  Re-key and re-test: re-key ships in v2.
                </p>
                <ProviderTestButton
                  baseUrl={editing.baseUrl}
                  model={editing.model}
                />
              </div>
            </>
          ) : loading ? (
            <div className="text-sm text-neutral-500">Loading…</div>
          ) : (
            <div className="text-sm text-neutral-500">Provider not found.</div>
          )}
        </div>
      )}
      <ProviderList onEdit={setEditingId} />
    </div>
  );
}

// Small wrapper that gives the new-provider form a Test button alongside
// the submit. The new-provider form manages its own state, so the test
// button here is uncontrolled and re-reads from the DOM when clicked.
function ProviderTestPlaceholder() {
  return (
    <div className="text-xs text-neutral-500">
      After saving, use the &ldquo;Test connection&rdquo; button next to the
      provider in the list to verify the connection.
    </div>
  );
}
