import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { apiBase, isDemo } from "./api-base.ts";
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
const transport = demo
  ? demoTransport()
  : liveTransport(apiBase(), import.meta.env["VITE_API_TOKEN"] ?? "");

createRoot(root).render(
  <StrictMode>
    {/* A demo mounts with a session already in flight. Without it the app
        starts on screen 1 with no session, and the six screens behind it are
        unreachable — which is what the recorded log exists to show. */}
    <App transport={transport} {...(demo ? { initial: demoState() } : {})} />
  </StrictMode>,
);
