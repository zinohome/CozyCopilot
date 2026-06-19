/**
 * Wire-format types for the postMessage bridge between the host page
 * (loaded by `public/embed/loader.js`) and the embed widget
 * (`app/(embed)/widget/*`). These are the *contract* the loader and
 * the widget both speak — a breaking change here is a breaking change
 * for every third-party embed, so changes go through the M6 contract
 * test in `tests/contract/embed-transport.contract.test.ts`.
 */

/** Outbound messages: widget → host. */
export type CozyOutboundMessage =
  | { type: "cozy:ready"; version: string }
  | { type: "cozy:session_started"; sessionId: string; personalityId: string }
  | { type: "cozy:tool_call"; id: string; name: string; arguments: unknown }
  | { type: "cozy:tool_result"; id: string; result: unknown }
  | { type: "cozy:voice_started"; sessionId: string }
  | { type: "cozy:voice_ended"; sessionId: string }
  | { type: "cozy:error"; code: string; message: string; userMessage: string };

/** Inbound messages: host → widget. */
export type CozyInboundMessage =
  | { type: "host:open" }
  | { type: "host:close" }
  | { type: "host:prefill"; content: string }
  | { type: "host:clear" }
  | { type: "host:set_personality"; personality: string };
