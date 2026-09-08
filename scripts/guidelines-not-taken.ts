/**
 * The upstream guidelines auteur deliberately does not take.
 *
 * Gate 10 uses this to answer a question the lock file cannot: a document in
 * `agent-guidelines` that is in neither the lock nor this list is one nobody
 * has decided about. A new upstream guideline is a decision to take it or not,
 * and silence is not one — it is how a repository ends up governed by whatever
 * was current the day it was seeded.
 *
 * The reasons are here rather than in a comment because they are what a reader
 * checks when they wonder whether the exclusion still holds. Two of the three
 * would stop holding if auteur grew accounts or a native component.
 */
export const NOT_TAKEN: Readonly<Record<string, string>> = {
  auth: "Single-user: no accounts, no sessions, no protected routes. There is no principal to authorize. `security` in base carries what does apply — secrets, input handling, what goes in an error body.",
  nextjs:
    "A Vite SPA has no App Router, no server components, no server actions and no route handlers. Its trigger — 'you add or modify a route, layout, or route handler' — would fire on every Hono route, pointing a reader at rules about `use client` while they edit a request handler.",
  rust: "No crate and none plausible. The two hot paths are a set lookup per word over a few million words, which is milliseconds in TypeScript.",
};
