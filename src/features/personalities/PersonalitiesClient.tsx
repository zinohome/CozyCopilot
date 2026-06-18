"use client";

import { useMemo } from "react";
import { useProviders } from "@/features/providers/useProviders";
import {
  PersonalityPicker,
  type ModelOption,
  type PersonalityPickerProps,
} from "./PersonalityPicker";

/**
 * Top-level wiring for the personality picker.
 *
 * Composes the picker with the providers hook to build the model dropdown:
 * custom providers' models are encoded as `<provider_id>:<model>` (per M4
 * plan §3.5), built-in providers keep plain model names. Keeping this
 * composition in one place means the picker itself remains a pure
 * presentation component that knows nothing about providers.
 *
 * `builtInModels` is fixed for v1 — the four flagship models exposed by
 * CozyEngineV2 by default. M7 themes can swap in a different default set.
 */
const BUILT_IN_MODELS = ["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet", "gemini-1.5-pro"];

export function PersonalitiesClient(
  props: Omit<PersonalityPickerProps, "modelOptions" | "builtInModels">,
) {
  const { providers } = useProviders();

  const modelOptions = useMemo<ModelOption[]>(() => {
    return providers.map((p) => ({
      value: `${p.id}:${p.model}`,
      label: `${p.label} · ${p.model}`,
    }));
  }, [providers]);

  return <PersonalityPicker {...props} modelOptions={modelOptions} builtInModels={BUILT_IN_MODELS} />;
}