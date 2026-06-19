// Contract test for the postMessage wire format between the embed
// widget and the host page. The loader (M6.3) and host integrations
// parse these messages — a breaking change to the shape would
// silently break third-party embeds.
//
// We test against the TypeScript types as the source of truth. If a
// change to `types.ts` produces a message shape that doesn't
// round-trip through JSON, this test fails. The samples here MUST
// stay in sync with `CozyOutboundMessage` / `CozyInboundMessage` —
// when a new variant is added to the union, add its sample here so
// the contract stays pinned.

import { describe, expect, it } from "vitest";
import type {
  CozyOutboundMessage,
  CozyInboundMessage,
} from "@/features/embed/types";

describe("embed postMessage contract", () => {
  it("all outbound messages are JSON-serializable and round-trip cleanly", () => {
    const samples: CozyOutboundMessage[] = [
      { type: "cozy:ready", version: "0.1.0" },
      { type: "cozy:session_started", sessionId: "s1", personalityId: "p1" },
      // `arguments` and `result` are intentionally `unknown` — verify
      // a structured payload survives the round-trip.
      { type: "cozy:tool_call", id: "t1", name: "search", arguments: { q: "x", n: 3 } },
      { type: "cozy:tool_result", id: "t1", result: { ok: true, hits: [1, 2, 3] } },
      { type: "cozy:voice_started", sessionId: "s1" },
      { type: "cozy:voice_ended", sessionId: "s1" },
      { type: "cozy:error", code: "PROVIDER_UNAVAILABLE", message: "boom", userMessage: "稍后重试" },
    ];

    for (const msg of samples) {
      expect(() => JSON.stringify(msg)).not.toThrow();
      const round = JSON.parse(JSON.stringify(msg));
      expect(round).toEqual(msg);
    }
  });

  it("all inbound messages are JSON-serializable and round-trip cleanly", () => {
    const samples: CozyInboundMessage[] = [
      { type: "host:open" },
      { type: "host:close" },
      { type: "host:prefill", content: "Hi" },
      { type: "host:clear" },
      { type: "host:set_personality", personality: "p1" },
    ];

    for (const msg of samples) {
      expect(() => JSON.stringify(msg)).not.toThrow();
      const round = JSON.parse(JSON.stringify(msg));
      expect(round).toEqual(msg);
    }
  });

  it("outbound and inbound namespaces don't overlap", () => {
    // `cozy:*` is widget → host, `host:*` is host → widget. A bug that
    // reused a name across the two sides would silently drop messages
    // because the inbound filter checks both `type` and `evt.source`,
    // and a misnamed message would never match. Pin the namespaces.
    const outbound: CozyOutboundMessage["type"][] = [
      "cozy:ready",
      "cozy:session_started",
      "cozy:tool_call",
      "cozy:tool_result",
      "cozy:voice_started",
      "cozy:voice_ended",
      "cozy:error",
    ];
    const inbound: CozyInboundMessage["type"][] = [
      "host:open",
      "host:close",
      "host:prefill",
      "host:clear",
      "host:set_personality",
    ];

    expect(outbound.every((t) => t.startsWith("cozy:"))).toBe(true);
    expect(inbound.every((t) => t.startsWith("host:"))).toBe(true);
    // Cast through `string` so the union→union comparison compiles; the
    // real check is "no outbound type string equals any inbound type string".
    expect(outbound.some((t) => (inbound as string[]).includes(t))).toBe(false);
  });
});
