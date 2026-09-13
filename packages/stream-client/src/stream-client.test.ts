import { describe, expect, test } from "bun:test";
import type { StoredEvent } from "@auteur/core/events";
import type { AuteurError } from "@auteur/errors/auteur-error";
import { connectStream, splitFrames, withCursor } from "./stream-client.ts";

const SESSION = "b1c9f2e0-0000-7000-8000-abcdefabcdef";

const frame = (seq: number, type = "stage_detail"): string =>
  `data: ${JSON.stringify({
    createdAt: new Date(1_770_000_000_000 + seq).toISOString(),
    event:
      type === "step"
        ? { step: "outline", type: "step" }
        : { line: `line ${seq.toString()}`, stageId: "draft", type },
    seq,
    sessionId: SESSION,
  })}\n\n`;

const sse = (body: string): Response =>
  new Response(body, {
    headers: { "content-type": "text/event-stream" },
    status: 200,
  });

/** Replays one body per connection, in order. */
const replaying = (bodies: readonly string[]) => {
  const cursors: number[] = [];
  let call = 0;
  return {
    cursors,
    fetch: (input: string | URL | Request): Promise<Response> => {
      cursors.push(Number(new URL(String(input)).searchParams.get("cursor")));
      const body = bodies[call] ?? "";
      call += 1;
      return Promise.resolve(sse(body));
    },
  };
};

const collect = async (
  bodies: readonly string[],
  maxEmptyReconnects = 0,
): Promise<{
  events: StoredEvent[];
  fatal: AuteurError | undefined;
  cursors: number[];
  cursor: number;
}> => {
  const transport = replaying(bodies);
  const events: StoredEvent[] = [];
  let fatal: AuteurError | undefined;
  const stream = connectStream({
    fetch: transport.fetch,
    maxEmptyReconnects,
    onEvent: (event) => events.push(event),
    onFatal: (error) => {
      fatal = error;
    },
    sleep: async () => undefined,
    url: `https://auteur.test/api/sessions/${SESSION}/events`,
  });
  await stream.done;
  return { cursor: stream.cursor(), cursors: transport.cursors, events, fatal };
};

describe("a drop reconnects from the cursor and delivers each event once", () => {
  test("the second connection asks for what the first delivered", async () => {
    // §7.3's first failure row. The durable log is the truth and the stream is
    // a convenience: anything the stream drops is still in the table.
    const { cursors, events } = await collect(
      [frame(1) + frame(2), frame(3), ""],
      2,
    );
    // The first three connections are the ones under test; the loop then runs
    // out its empty-reconnect budget against the exhausted transport.
    expect(cursors.slice(0, 3)).toEqual([0, 2, 3]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  test("a replayed event at or below the cursor is dropped", async () => {
    // The server may replay from the cursor or after it. The client is what
    // makes delivery exactly-once either way.
    const { events } = await collect(
      [frame(1) + frame(2), frame(2) + frame(3), ""],
      2,
    );
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  test("the cursor is the highest seq delivered", async () => {
    const { cursor } = await collect([frame(1) + frame(7), ""], 1);
    expect(cursor).toBe(7);
  });
});

describe("a 404 is fatal at once", () => {
  test("it does not reconnect", async () => {
    // The session is gone, and every reconnect would ask the same question and
    // get the same answer.
    let calls = 0;
    let fatal: AuteurError | undefined;
    const stream = connectStream({
      fetch: () => {
        calls += 1;
        return Promise.resolve(new Response("", { status: 404 }));
      },
      onEvent: () => undefined,
      onFatal: (error) => {
        fatal = error;
      },
      sleep: async () => undefined,
      url: "https://auteur.test/api/sessions/x/events",
    });
    await stream.done;
    expect(calls).toBe(1);
    expect(fatal?.code).toBe("not_found");
  });
});

describe("an unparseable frame is fatal at once", () => {
  test("it does not reconnect into the same frame forever", async () => {
    // Reconnecting from the same cursor refetches the same bad frame, and a
    // client that keeps trying is one that never tells anyone.
    const { events, fatal, cursors } = await collect(
      ["data: {not json}\n\n", frame(1), ""],
      3,
    );
    expect(cursors).toHaveLength(1);
    expect(events).toEqual([]);
    expect(fatal?.message).toContain("not JSON");
  });

  test("a frame that parses but is not an event is fatal too", async () => {
    const { fatal } = await collect(['data: {"seq":"one"}\n\n'], 3);
    expect(fatal?.message).toContain("cannot read");
  });

  test("the frames before the bad one were already delivered", async () => {
    // They are real: the log has them and the cursor moved past them.
    const { events } = await collect([frame(1) + "data: {oops}\n\n"], 3);
    expect(events.map((event) => event.seq)).toEqual([1]);
  });
});

describe("close is idempotent and aborts the in-flight request", () => {
  test("calling it twice is not an error, and nothing arrives after", async () => {
    // The response is already in hand when `close()` lands: an abort races the
    // bytes rather than unwinding them. A consumer that stopped listening is
    // still not called, and the cursor does not move past what it never saw.
    const events: number[] = [];
    const stream = connectStream({
      fetch: () => Promise.resolve(sse(frame(1))),
      onEvent: (event) => events.push(event.seq),
      onFatal: () => undefined,
      sleep: async () => undefined,
      url: "https://auteur.test/api/sessions/x/events",
    });
    stream.close();
    stream.close();
    await stream.done;
    expect(events).toEqual([]);
    expect(stream.cursor()).toBe(0);
  });

  test("it stops the reconnect loop", async () => {
    let calls = 0;
    const stream = connectStream({
      fetch: () => {
        calls += 1;
        return Promise.resolve(sse(""));
      },
      onEvent: () => undefined,
      onFatal: () => undefined,
      sleep: async () => {
        stream.close();
      },
      url: "https://auteur.test/api/sessions/x/events",
    });
    await stream.done;
    expect(calls).toBe(1);
  });
});

describe("reconnecting into silence is bounded", () => {
  test("it gives up after the declared number of empty reconnects", async () => {
    // Bounded on *empty* reconnects rather than on total attempts: a stream
    // that reconnects every four minutes and delivers a stage each time is
    // working — that is the ordinary case now, since the function ceiling ends
    // every long run's stream.
    const { cursors, fatal } = await collect(["", "", "", "", ""], 2);
    expect(cursors.length).toBeLessThanOrEqual(4);
    expect(fatal?.message).toContain("delivered nothing");
  });

  test("a delivery resets the count", async () => {
    const { events } = await collect(["", frame(1), "", frame(2), ""], 1);
    expect(events.map((event) => event.seq)).toEqual([1, 2]);
  });
});

describe("frames split across reads", () => {
  test("a frame arriving in two chunks is still one frame", () => {
    // The ordinary case on a real socket. A parser that assumed whole frames
    // would pass a neater test and fail in production.
    const first = splitFrames('data: {"a":1}\n');
    expect(first.frames).toEqual([]);
    const second = splitFrames(`${first.rest}\ndata: {"b":2}\n\n`);
    expect(second.frames).toHaveLength(2);
  });

  test("a trailing partial frame is kept, not dropped", () => {
    const { frames, rest } = splitFrames("data: a\n\ndata: par");
    expect(frames).toEqual(["data: a"]);
    expect(rest).toBe("data: par");
  });
});

describe("a reload resumes from the cursor it already has", () => {
  test("the first connection asks for the given cursor, not for zero", async () => {
    // Without this the client replays the whole log on every reload and then
    // drops most of it as at-or-below-cursor: correct, and the cost is a
    // session's entire event history on the wire.
    const transport = replaying([frame(8), ""]);
    const events: number[] = [];
    const stream = connectStream({
      fetch: transport.fetch,
      maxEmptyReconnects: 0,
      onEvent: (event) => events.push(event.seq),
      onFatal: () => undefined,
      sleep: async () => undefined,
      startCursor: 7,
      url: `https://auteur.test/api/sessions/${SESSION}/events`,
    });
    await stream.done;
    expect(transport.cursors[0]).toBe(7);
    expect(events).toEqual([8]);
  });

  test("an event at or below the starting cursor is still dropped", async () => {
    const transport = replaying([frame(5) + frame(9), ""]);
    const events: number[] = [];
    const stream = connectStream({
      fetch: transport.fetch,
      maxEmptyReconnects: 0,
      onEvent: (event) => events.push(event.seq),
      onFatal: () => undefined,
      sleep: async () => undefined,
      startCursor: 7,
      url: `https://auteur.test/api/sessions/${SESSION}/events`,
    });
    await stream.done;
    expect(events).toEqual([9]);
  });
});

describe("a same-origin url is a url", () => {
  test("a relative url gets a cursor rather than throwing", () => {
    // `new URL("/api/...")` needs a base, and on the deployment there is none:
    // the client and the routes are one origin.
    expect(withCursor("/api/sessions/abc/events", 0)).toBe(
      "/api/sessions/abc/events?cursor=0",
    );
  });

  test("the cursor is replaced on each read, never appended twice", () => {
    // The reconnect loop rewrites it every time; a second `cursor=` would make
    // the server read whichever the parser picked.
    expect(withCursor("/api/sessions/abc/events?cursor=3", 7)).toBe(
      "/api/sessions/abc/events?cursor=7",
    );
  });

  test("an absolute url keeps its origin", () => {
    expect(
      withCursor("https://preview.auteur.test/api/sessions/a/events", 2),
    ).toBe("https://preview.auteur.test/api/sessions/a/events?cursor=2");
  });
});

/** Resolves on the nth connection, so a test never spins waiting for one. */
const nth = (target: number) => {
  let reached: (() => void) | undefined;
  const at = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let calls = 0;
  return {
    at,
    count: () => calls,
    tick: () => {
      calls += 1;
      if (calls >= target) reached?.();
      return calls;
    },
  };
};

describe("a quiet pipeline is not a broken stream", () => {
  test("a connection carrying only heartbeats does not count as empty", async () => {
    // The defect, at the numbers it happened at. The route holds every
    // connection open for its whole budget whether or not anything is
    // appended, so a run that says nothing for five minutes — most of a
    // research stage, where the card takes three and a half — reconnected
    // five times and the client gave up for good. Every screen from then on
    // needed a manual reload.
    //
    // Elapsed time cannot tell those apart: it is the same fifty seconds on a
    // working stream and on one talking to a route that will never speak.
    // Bytes can, which is what the heartbeat frame is for.
    const connections = nth(9);
    let fatal: AuteurError | undefined;
    const stream = connectStream({
      fetch: () => Promise.resolve(sse(": ping\n\n")),
      maxEmptyReconnects: 2,
      onEvent: () => undefined,
      onFatal: (error) => {
        fatal = error;
      },
      sleep: async () => {
        connections.tick();
      },
      url: "https://auteur.test/api/sessions/x/events",
    });
    await connections.at;
    stream.close();
    await stream.done;

    expect(fatal).toBeUndefined();
    expect(connections.count()).toBeGreaterThan(5);
  });

  test("an endpoint that sends nothing at all still ends the stream", async () => {
    // The condition the budget is actually for: reconnecting into something
    // that is not there. A client that kept trying would never tell anyone.
    let fatal: AuteurError | undefined;
    const stream = connectStream({
      fetch: () => Promise.resolve(sse("")),
      maxEmptyReconnects: 2,
      onEvent: () => undefined,
      onFatal: (error) => {
        fatal = error;
      },
      sleep: async () => undefined,
      url: "https://auteur.test/api/sessions/x/events",
    });
    await stream.done;
    expect(fatal?.message).toContain("delivered nothing");
  });

  test("a connection torn after delivering is not an empty reconnect", async () => {
    // The other half. A stream that delivers a stage and is then cut at the
    // function ceiling is working; counting each tear as empty ended it after
    // six of them, which on a long run is six minutes.
    const connections = nth(9);
    let fatal: AuteurError | undefined;
    const stream = connectStream({
      fetch: () => {
        // `pull` rather than `start`, so the frame is read before the tear.
        // Erroring in `start` rejects the first `read()` and the event never
        // reaches the consumer, which is a different failure.
        let sent = false;
        const seq = connections.count() + 1;
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              pull: (controller) => {
                if (sent) {
                  controller.error(new Error("the connection was torn"));
                  return;
                }
                sent = true;
                controller.enqueue(new TextEncoder().encode(frame(seq)));
              },
            }),
            { headers: { "content-type": "text/event-stream" }, status: 200 },
          ),
        );
      },
      maxEmptyReconnects: 2,
      onEvent: () => undefined,
      onFatal: (error) => {
        fatal = error;
      },
      sleep: async () => {
        connections.tick();
      },
      url: "https://auteur.test/api/sessions/x/events",
    });
    await connections.at;
    stream.close();
    await stream.done;

    expect(fatal).toBeUndefined();
    expect(connections.count()).toBeGreaterThan(5);
  });
});
