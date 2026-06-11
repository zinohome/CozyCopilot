// WebSocket proxy to CozyEngineV2
// M2: thin relay; M4 will add client-side reconnection logic.
//
// Next.js 15 supports WebSocket upgrade via the `webSocket` field on the
// Response init object (Node runtime only). The runtime injects a
// `WebSocketPair` global; we build a pair, take one side as the client
// socket, and pipe messages to/from an upstream `WebSocket` to CozyEngineV2.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

interface WebSocketPairLike {
  0: WebSocket;
  1: WebSocket;
}

declare global {
  // WebSocketPair is injected by Next.js's Node runtime; not present in jsdom.
  var WebSocketPair: (() => WebSocketPairLike) | undefined;
}

function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "missing ?token query param",
        userMessage: "请重新登录",
        retryable: false,
      },
    }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

function unsupportedResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "WS_DISCONNECTED",
        message: "WebSocket upgrade not supported in this runtime",
        userMessage: "实时连接暂不可用",
        retryable: true,
      },
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}

export async function GET(req: Request) {
  // 1. Authenticate via ?token=<jwt> query param
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return unauthorizedResponse();

  // 2. Confirm WebSocketPair is available (Next.js Node runtime only)
  const PairCtor = (globalThis as { WebSocketPair?: () => WebSocketPairLike })
    .WebSocketPair;
  if (typeof PairCtor !== "function") return unsupportedResponse();

  // 3. Build the client <-> server socket pair
  const pair = PairCtor.call(globalThis);
  const clientSocket = pair[0];
  const serverSocket = pair[1];

  // 4. Open upstream connection to CozyEngineV2
  const upstreamHttpUrl = COZY_ENGINE_URL;
  const upstreamWsUrl =
    upstreamHttpUrl.replace(/^http/, "ws") +
    `/v1/ws/chat?token=${encodeURIComponent(token)}`;

  let upstream: WebSocket;
  try {
    upstream = new WebSocket(upstreamWsUrl);
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "WS_DISCONNECTED",
          message: "failed to open upstream WebSocket",
          userMessage: "实时连接失败",
          retryable: true,
        },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const closeBoth = (): void => {
    try {
      if (clientSocket.readyState !== WebSocket.CLOSED) clientSocket.close();
    } catch {
      /* ignore */
    }
    try {
      if (upstream.readyState !== WebSocket.CLOSED) upstream.close();
    } catch {
      /* ignore */
    }
  };

  // 5. Pipe client -> upstream
  clientSocket.addEventListener("message", (e: MessageEvent) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(e.data);
    }
  });
  clientSocket.addEventListener("close", closeBoth);
  clientSocket.addEventListener("error", closeBoth);

  // 6. Pipe upstream -> client
  upstream.addEventListener("message", (e: MessageEvent) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(e.data);
    }
  });
  upstream.addEventListener("close", closeBoth);
  upstream.addEventListener("error", closeBoth);

  // 7. Return the server-side of the pair as the upgrade response.
  // Next.js reads the `webSocket` field on the Response init to complete
  // the upgrade; this is not a standard web Response, hence the cast.
  return new Response(null, {
    status: 101,
    webSocket: serverSocket,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
