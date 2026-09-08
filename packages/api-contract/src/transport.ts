/**
 * The transport both clients take, and the smallest shape that will do.
 *
 * Not `typeof globalThis.fetch`: that type carries `preconnect`, which neither
 * client calls, so requiring it would force every injected transport — every
 * test, every server-side caller — to satisfy a member nobody uses. Injection
 * over mocking only works if the injected thing is cheap to write.
 */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
