"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { useProviders, type ProviderTestResult } from "./useProviders";

export function ProviderTestButton({
  baseUrl,
  apiKey,
  model,
}: {
  baseUrl: string;
  apiKey?: string;
  model: string;
}) {
  const { test } = useProviders();
  const [result, setResult] = useState<ProviderTestResult | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    setResult(null);
    try {
      // v1: re-testing an existing provider from the list (no key in hand)
      // is gated — re-key flow ships in v2. The form always has the key, so
      // this branch only fires from the list/edit pages.
      if (!apiKey) {
        setResult({
          ok: false,
          error: { code: "MISSING_KEY", message: "Enter the API key to test" },
        });
        return;
      }
      const r = await test({ baseUrl, apiKey, model });
      setResult(r);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "TEST_FAILED";
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Test failed";
      setResult({ ok: false, error: { code, message } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded border border-orange-300 px-3 py-1.5 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50"
      >
        {busy ? "Testing…" : "Test connection"}
      </button>
      {result && (
        <div
          role="status"
          className={`mt-2 rounded p-2 text-xs ${
            result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {result.ok ? (
            <>
              ✓ Connected
              {typeof result.latencyMs === "number" && ` in ${result.latencyMs}ms`}
              {result.models && ` (${result.models.length} models)`}
            </>
          ) : (
            <>
              ✗ {result.error?.code ?? "ERROR"}: {result.error?.message ?? "Test failed"}
            </>
          )}
        </div>
      )}
    </div>
  );
}
