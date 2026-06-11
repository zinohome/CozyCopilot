"use client";

import { useCallback, useEffect, useState } from "react";
import * as notify from "@/lib/notifications";

export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

export type NotifyState = {
  permission: NotifyPermission;
  busy: boolean;
};

/**
 * React hook for OS notifications. Returns the current permission
 * state, a `request()` function to trigger the permission prompt,
 * and a `send()` function to fire a notification.
 *
 * Consumers typically call `request()` on first user action and
 * `send()` on chat-completed / tool-finished events.
 *
 * `NotifyOptions` is a union across the platform impls (web, Tauri,
 * Capacitor); the portable subset is `{title, body}`. `tag` works on
 * web and Tauri, `id` works on Capacitor, neither on the others.
 * Pass whatever fits your platform — the type system will accept
 * any union member.
 *
 * @example
 * ```tsx
 * const { permission, request, send } = useNotify();
 * const onClick = async () => {
 *   if (permission === "default") await request();
 *   send({ title: "Done", body: "Your chat has finished" });
 * };
 * ```
 */
export function useNotify(): NotifyState & {
  request: () => Promise<NotifyPermission>;
  send: (opts: notify.NotifyOptions) => void;
} {
  const [permission, setPermission] = useState<NotifyPermission>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(notify.getPermission());
  }, []);

  const request = useCallback(async () => {
    setBusy(true);
    try {
      const next = await notify.requestPermission();
      setPermission(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const send = useCallback((opts: notify.NotifyOptions) => {
    notify.notify(opts);
  }, []);

  return { permission, busy, request, send };
}
