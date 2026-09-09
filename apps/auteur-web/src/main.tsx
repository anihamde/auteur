import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { apiBase, apiToken, isDemo } from "./api-base.ts";
import { demoState, demoTransport } from "./demo/transport.ts";
import { App } from "./shell/app.tsx";
import { liveTransport } from "./shell/session-state.ts";

/**
 * The entry point.
 *
 * The transport is chosen **here and nowhere else**: demo mode substitutes a
 * different `Transport` rather than adding a branch to every screen, which is
 * what makes "zero network requests" a property a fetch spy can check.
 */
const root = document.querySelector("#root");
if (root === null) {
  throw new Error("#root is missing from index.html");
}

const demo = isDemo();

/**
 * A misconfigured build says so on the page.
 *
 * `apiToken` throws, and an uncaught throw here is a white screen with the
 * reason in a console nobody has open. The deployment that is missing the
 * variable is exactly the one whose operator is looking at the page.
 */
let transport:
  | ReturnType<typeof liveTransport>
  | ReturnType<typeof demoTransport>;
try {
  transport = demo ? demoTransport() : liveTransport(apiBase(), apiToken());
} catch (error) {
  root.textContent =
    error instanceof Error ? error.message : "The client is misconfigured.";
  throw error;
}

createRoot(root).render(
  <StrictMode>
    {/* A demo mounts with a session already in flight. Without it the app
        starts on screen 1 with no session, and the six screens behind it are
        unreachable — which is what the recorded log exists to show. */}
    <App transport={transport} {...(demo ? { initial: demoState() } : {})} />
  </StrictMode>,
);
