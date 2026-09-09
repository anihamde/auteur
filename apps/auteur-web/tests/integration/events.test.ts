import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { ROUTE_NAMES, ROUTES, specOf } from "@auteur/api-contract/routes";
import type { StoredEvent } from "@auteur/core/events";
import { append } from "@auteur/event-store/events";
import { claimRun } from "@auteur/event-store/session-runs";
import { newId } from "@auteur/ids/new-id";
import { createSession } from "@auteur/session-store/sessions";
import {
  connectStream,
  type Stream,
} from "@auteur/stream-client/stream-client";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";

const TOKEN = "a-token-of-at-least-16-chars";

let harness: TestDb;
let sessionId: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
  app = createApp({
    apiToken: TOKEN,
    db: harness.db,
    // Direct, because `LISTEN` binds to a connection. `createTestDb` hands out
    // direct handles, which is what makes this assertable at all.
    events: { budgetMs: 1500, directDb: harness.other, pollMs: 50 },
  });
});

const aDetail = (line: string) =>
  ({ line, stageId: "outline", type: "stage_detail" }) as const;

/** Read one stream to its clean close, collecting what it delivered. */
const readStream = async (
  cursor: number,
  duringOpen?: () => Promise<void>,
): Promise<StoredEvent[]> => {
  const delivered: StoredEvent[] = [];
  let stream: Stream | undefined;
  const done = new Promise<void>((resolve) => {
    stream = connectStream({
      fetch: async (url, init) =>
        app.request(url, {
          ...init,
          headers: { authorization: `Bearer ${TOKEN}` },
        }),
      maxEmptyReconnects: 0,
      onEvent: (event) => delivered.push(event),
      onFatal: () => resolve(),
      sleep: async () => resolve(),
      startCursor: cursor,
      url: `http://auteur.test/api/sessions/${sessionId}/events`,
    });
  });
  await duringOpen?.();
  await done;
  stream?.close();
  return delivered;
};

describe("replay from the cursor", () => {
  test("a client reconnecting at its cursor receives every missed event exactly once", async () => {
    for (const line of ["one", "two", "three"]) {
      await append(harness.db, sessionId, aDetail(line));
    }
    // Reconnecting at 1: everything after seq 1, nothing before, nothing twice.
    const delivered = await readStream(1);
    expect(delivered.map((event) => event.seq)).toEqual([2, 3]);
  });

  test("a run completing with no client connected still persists every event", async () => {
    // The table is the truth and the stream is a convenience.
    for (const line of ["one", "two"]) {
      await append(harness.db, sessionId, aDetail(line));
    }
    const delivered = await readStream(0);
    expect(delivered.map((event) => event.seq)).toEqual([1, 2]);
  });

  test("an event appended while the stream is open arrives on it", async () => {
    const delivered = await readStream(0, async () => {
      await append(harness.db, sessionId, aDetail("live"));
    });
    expect(delivered.map((event) => event.seq)).toContain(1);
  });

  test("the stream ends cleanly at the budget and the client resumes with no gap", async () => {
    // The common case now, not the exceptional one: the function ceiling ends
    // every long run's stream.
    await append(harness.db, sessionId, aDetail("before"));
    const first = await readStream(0);
    expect(first.map((event) => event.seq)).toEqual([1]);

    await append(harness.db, sessionId, aDetail("after"));
    const second = await readStream(first.at(-1)?.seq ?? 0);
    expect(second.map((event) => event.seq)).toEqual([2]);
  });

  test("an unknown session is 404 rather than an empty stream", async () => {
    // A stream a client would reconnect to for ever.
    const response = await app.request(
      "/api/sessions/b1c9f2e0-0000-4000-8000-abcdefabcdef/events?cursor=0",
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    expect(response.status).toBe(404);
  });

  test("a negative cursor is 400", async () => {
    const response = await app.request(
      `/api/sessions/${sessionId}/events?cursor=-1`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    expect(response.status).toBe(400);
  });
});

describe("the streaming route is the only one that streams", () => {
  test("exactly one route declares it, and it is the events route", async () => {
    // The direct connection string is read by that route and no other; the
    // contract is where that is stated, so it is enumerated rather than
    // spot-checked.
    const streaming = ROUTE_NAMES.filter(
      (name) => specOf(name).stream === true,
    );
    expect(streaming).toEqual(["events"]);
  });
});

describe("cancel sets the flag", () => {
  test("a running session can be cancelled", async () => {
    await claimRun(harness.db, sessionId, "an-invocation");
    const response = await app.request(`/api/sessions/${sessionId}/cancel`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(ROUTES.cancel.response.parse(await response.json())).toEqual({
      cancelling: true,
    });
  });

  test("cancelling a session with no run in flight is false, not an error", async () => {
    // A reader pressing cancel as the last stage lands has done nothing wrong,
    // and a 409 would tell them they had.
    const response = await app.request(`/api/sessions/${sessionId}/cancel`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(ROUTES.cancel.response.parse(await response.json())).toEqual({
      cancelling: false,
    });
  });

  test("cancelling an unknown session is 404", async () => {
    const response = await app.request(
      "/api/sessions/b1c9f2e0-0000-4000-8000-abcdefabcdef/cancel",
      { headers: { authorization: `Bearer ${TOKEN}` }, method: "POST" },
    );
    expect(response.status).toBe(404);
  });
});
