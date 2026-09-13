import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { ROUTES } from "@auteur/api-contract/routes";
import { AuteurError } from "@auteur/errors/auteur-error";
import { readSince } from "@auteur/event-store/events";
import { newId } from "@auteur/ids/new-id";
import { createLogger, type LogFields } from "@auteur/logger/logger";
import { createSession, updateSession } from "@auteur/session-store/sessions";
import { readStageKeys } from "@auteur/session-store/stage-keys";
import {
  enqueueStage,
  findQueueEntry,
  listQueueForSession,
} from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";
import {
  SIGNATURE_HEADER,
  signPayload,
} from "../../server/_internal/signature.ts";
import type { StageBody } from "../../server/_internal/stage.ts";

const TOKEN = "a-token-of-at-least-16-chars";
const SECRET = "a-stage-secret-of-16-plus";

let harness: TestDb;
let sessionId: string;

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
});

const noop: StageBody = async () => undefined;

const post = async (
  payload: unknown,
  options: {
    readonly body?: StageBody;
    readonly signature?: string | null;
    readonly claimant?: string;
    readonly onLog?: (message: string, fields?: LogFields) => void;
  } = {},
): Promise<Response> => {
  const app = createApp({
    apiToken: TOKEN,
    db: harness.db,
    internalStage: {
      runStageBody: options.body ?? noop,
      stageSecret: SECRET,
      ...(options.claimant !== undefined && {
        claimant: () => options.claimant ?? "",
      }),
    },
    ...(options.onLog !== undefined && {
      logger: { ...createLogger({ bound: {} }), error: options.onLog },
    }),
  });
  const raw = JSON.stringify(payload);
  const signature =
    options.signature === undefined
      ? signPayload(SECRET, raw)
      : options.signature;
  return app.request(ROUTES.internalStage.path, {
    body: raw,
    headers: {
      "content-type": "application/json",
      ...(signature === null ? {} : { [SIGNATURE_HEADER]: signature }),
    },
    method: "POST",
  });
};

const queueOne = async (stageId = "outline"): Promise<string> => {
  const id = newId();
  await enqueueStage(harness.db, { id, sessionId, stageId });
  return id;
};

describe("the signature is verified before anything is written", () => {
  test("an unsigned request is rejected and no row changes", async () => {
    const queueId = await queueOne();
    const response = await post(
      { queueId, sessionId, stageId: "outline" },
      { signature: null },
    );
    expect(response.status).toBe(401);
    expect((await findQueueEntry(harness.db, queueId))?.status).toBe("queued");
  });

  test("a wrongly-signed request is rejected and no row changes", async () => {
    const queueId = await queueOne();
    const response = await post(
      { queueId, sessionId, stageId: "outline" },
      { signature: signPayload("the-wrong-secret-entirely", "{}") },
    );
    expect(response.status).toBe(401);
    expect((await findQueueEntry(harness.db, queueId))?.status).toBe("queued");
  });

  test("the bearer token is not accepted in its place", async () => {
    // A browser holding the client's token must not be able to drive the
    // pipeline directly.
    const queueId = await queueOne();
    const app = createApp({
      apiToken: TOKEN,
      db: harness.db,
      internalStage: { runStageBody: noop, stageSecret: SECRET },
    });
    const response = await app.request(ROUTES.internalStage.path, {
      body: JSON.stringify({ queueId, sessionId, stageId: "outline" }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(401);
  });

  test("the signature covers the body, so a swapped queue id fails", async () => {
    const queueId = await queueOne();
    const other = await queueOne("story");
    const signed = signPayload(
      SECRET,
      JSON.stringify({ queueId, sessionId, stageId: "outline" }),
    );
    const response = await post(
      { queueId: other, sessionId, stageId: "story" },
      { signature: signed },
    );
    expect(response.status).toBe(401);
    expect((await findQueueEntry(harness.db, other))?.status).toBe("queued");
  });
});

describe("exactly one invocation claims a row", () => {
  test("two racing invocations: one runs the stage and the other does not", async () => {
    // The property the cron sweep depends on. A read-then-write, however
    // carefully ordered, has a window where both callers have seen `queued`.
    const queueId = await queueOne();
    let runs = 0;
    const counting: StageBody = async () => {
      runs += 1;
    };

    const [first, second] = await Promise.all([
      post({ queueId, sessionId, stageId: "outline" }, { body: counting }),
      post({ queueId, sessionId, stageId: "outline" }, { body: counting }),
    ]);

    const bodies = [
      ROUTES.internalStage.response.parse(await first.json()),
      ROUTES.internalStage.response.parse(await second.json()),
    ];
    expect(bodies.filter((body) => body.claimed)).toHaveLength(1);
    expect(runs).toBe(1);
  });

  test("the loser is a 200 with claimed false, not an error", async () => {
    // It is the ordinary outcome of a sweep racing a live invocation.
    const queueId = await queueOne();
    await post({ queueId, sessionId, stageId: "outline" });
    const second = await post({ queueId, sessionId, stageId: "outline" });
    expect(second.status).toBe(200);
    expect(
      ROUTES.internalStage.response.parse(await second.json()).claimed,
    ).toBe(false);
  });
});

describe("a stage that throws", () => {
  test("leaves its row error with the attempt recorded, never claimed", async () => {
    // `claimed` for ever is the state the sweep cannot distinguish from a
    // stage that is still running.
    const queueId = await queueOne();
    const throwing: StageBody = () => {
      throw new AuteurError("provider_error", "The gateway refused.");
    };
    const response = await post(
      { queueId, sessionId, stageId: "outline" },
      { body: throwing },
    );
    expect(response.status).toBe(200);

    const entry = await findQueueEntry(harness.db, queueId);
    expect(entry?.status).toBe("error");
    expect(entry?.attempt).toBe(0);

    // Re-enqueued at attempt + 1 under the budget: a new row, so the queue
    // keeps the history of what was tried.
    const queue = await listQueueForSession(harness.db, sessionId);
    expect(
      queue.some((row) => row.status === "queued" && row.attempt === 1),
    ).toBe(true);
  });

  test("a failure appends a stage_error event, so a reconnecting client is told", async () => {
    const queueId = await queueOne();
    const throwing: StageBody = () => {
      throw new AuteurError("schema_violation", "The outline did not parse.");
    };
    await post({ queueId, sessionId, stageId: "outline" }, { body: throwing });

    const events = await readSince(harness.db, sessionId, 0);
    const failure = events.find((event) => event.event.type === "stage_error");
    expect(failure).toBeDefined();
  });

  test("the gateway's own reason reaches the event, not just the mapped sentence", async () => {
    // Every provider failure maps to "The model gateway failed.", so a stage
    // that failed on a context limit and one that failed on an expired key
    // were the same line on the screen and in `events`. The reason was
    // computed, redacted, and dropped one call before anyone could read it.
    const queueId = await queueOne();
    const throwing: StageBody = () => {
      throw new AuteurError("provider_error", "The model gateway failed.", {
        detail: {
          code: "context_length_exceeded",
          provider: "ramp-router",
          reason: "This model's maximum context length is 200000 tokens.",
          status: 400,
        },
      });
    };
    await post({ queueId, sessionId, stageId: "outline" }, { body: throwing });

    const events = await readSince(harness.db, sessionId, 0);
    const failure = events.find(
      (event) => event.event.type === "stage_error",
    )?.event;
    expect(failure).toMatchObject({
      detail:
        "context_length_exceeded HTTP 400: This model's maximum context length is 200000 tokens.",
    });
  });

  test("a failure and a completion are different answers", async () => {
    // Both were `{claimed: true, enqueued: []}` — a stage that finished with no
    // successor and one that failed produced the same body, so the response
    // said nothing about the only thing it was asked.
    const failing = await post(
      { queueId: await queueOne(), sessionId, stageId: "outline" },
      {
        body: () => {
          throw new AuteurError("provider_error", "The gateway refused.");
        },
      },
    );
    expect(await failing.json()).toMatchObject({ outcome: "error" });

    const succeeding = await post({
      queueId: await queueOne("style-fit"),
      sessionId,
      stageId: "style-fit",
    });
    expect(await succeeding.json()).toMatchObject({
      enqueued: [],
      outcome: "done",
    });
  });

  test("a schema violation names the field, not just the shape", async () => {
    // "returned JSON that is not the shape it declared" is every schema
    // failure. Which field is the diagnosis, and it was in the thrown detail
    // and nowhere a reader could reach.
    const queueId = await queueOne();
    const throwing: StageBody = () => {
      throw new AuteurError("schema_violation", "Not the declared shape.", {
        detail: {
          issues: [
            {
              code: "too_small",
              message: "Array must contain at least 8 element(s)",
              path: ["exemplars"],
            },
          ],
        },
      });
    };
    await post({ queueId, sessionId, stageId: "outline" }, { body: throwing });

    const events = await readSince(harness.db, sessionId, 0);
    expect(
      events.find((event) => event.event.type === "stage_error")?.event,
    ).toMatchObject({
      detail: "exemplars: Array must contain at least 8 element(s)",
    });
  });

  test("a body that is not JSON is the caller's fault, not the server's", async () => {
    // `JSON.parse` throws a `SyntaxError`, which is in no taxonomy, so it
    // reached `app.onError` as an unexpected failure and a malformed request
    // was answered `500 internal`.
    const app = createApp({
      apiToken: TOKEN,
      db: harness.db,
      internalStage: { runStageBody: noop, stageSecret: SECRET },
    });
    const raw = "{not json";
    const response = await app.request(ROUTES.internalStage.path, {
      body: raw,
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: signPayload(SECRET, raw),
      },
      method: "POST",
    });
    expect(response.status).toBe(400);
  });

  test("the route answers 200, so only this log ever records the failure", async () => {
    // A failed stage is an outcome rather than a failed request, so
    // `app.onError` never sees it. Before this the failure was in no log at
    // all — the platform's viewer showed a clean 200.
    const queueId = await queueOne();
    const lines: { message: string; fields: LogFields | undefined }[] = [];
    const throwing: StageBody = () => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:5432");
    };
    const response = await post(
      { queueId, sessionId, stageId: "outline" },
      {
        body: throwing,
        onLog: (message, fields) => lines.push({ fields, message }),
      },
    );

    expect(response.status).toBe(200);
    expect(lines[0]?.message).toBe("stage failed");
    // The thrown message, not the mapped one. Everything that is not an
    // `AuteurError` becomes "The stage failed.", and this is where the real
    // sentence survives.
    // `thrown`, not `message`: the log record owns that key, and a field of
    // the same name used to be dropped without a word — which is how every
    // stage failure for an evening reported "stage failed" and swallowed the
    // sentence that said why.
    expect(lines[0]?.fields).toMatchObject({
      code: "internal",
      stageId: "outline",
      thrown: "connect ECONNREFUSED 10.0.0.1:5432",
    });
  });

  test("a failed stage records no key, so it is stale and will be retried", async () => {
    const queueId = await queueOne();
    const throwing: StageBody = () => {
      throw new AuteurError("provider_error", "The gateway refused.");
    };
    await post({ queueId, sessionId, stageId: "outline" }, { body: throwing });
    expect((await readStageKeys(harness.db, sessionId)).has("outline")).toBe(
      false,
    );
  });
});

describe("a stage that succeeds", () => {
  test("records its key, completes its row, and enqueues its successors", async () => {
    // On the `draft` step: the reader has asked for a draft, so the stage that
    // finishes the beat sheet is allowed to start one.
    await updateSession(harness.db, sessionId, { step: "story" });
    const queueId = await queueOne("outline");
    const response = await post({ queueId, sessionId, stageId: "outline" });
    const body = ROUTES.internalStage.response.parse(await response.json());

    expect(body.claimed).toBe(true);
    expect(body.enqueued).toEqual(["story"]);
    expect((await findQueueEntry(harness.db, queueId))?.status).toBe("done");
    expect((await readStageKeys(harness.db, sessionId)).has("outline")).toBe(
      true,
    );
  });

  test("a successor past the session's step is not enqueued", async () => {
    // The defect this holds shut: on the worker, `clarify` finished and
    // `outline` started in the same second — before the reader had answered a
    // question — so the beat sheet was built from an empty answer set. The key
    // and the completion still happen; only the successor is withheld.
    await updateSession(harness.db, sessionId, { step: "clarify" });
    const queueId = await queueOne("clarify");
    const body = ROUTES.internalStage.response.parse(
      await (await post({ queueId, sessionId, stageId: "clarify" })).json(),
    );

    expect(body.claimed).toBe(true);
    expect(body.enqueued).toEqual([]);
    expect((await findQueueEntry(harness.db, queueId))?.status).toBe("done");
    expect(
      (await listQueueForSession(harness.db, sessionId)).map(
        (row) => row.stageId,
      ),
    ).not.toContain("outline");
  });

  test("the last stage enqueues nothing, which is how a run ends", async () => {
    const queueId = await queueOne("style-fit");
    const body = ROUTES.internalStage.response.parse(
      await (await post({ queueId, sessionId, stageId: "style-fit" })).json(),
    );
    expect(body.enqueued).toEqual([]);
  });

  test("it asks for the next stage to run, and only the first of them", async () => {
    const invoked: string[] = [];
    await updateSession(harness.db, sessionId, { step: "research" });
    const queueId = await queueOne("work-fetch");
    const app = createApp({
      apiToken: TOKEN,
      db: harness.db,
      internalStage: { runStageBody: noop, stageSecret: SECRET },
      invokeStage: async ({ stageId }) => {
        invoked.push(stageId);
      },
    });
    const raw = JSON.stringify({ queueId, sessionId, stageId: "work-fetch" });
    await app.request(ROUTES.internalStage.path, {
      body: raw,
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: signPayload(SECRET, raw),
      },
      method: "POST",
    });
    expect(invoked).toHaveLength(1);
  });
});
