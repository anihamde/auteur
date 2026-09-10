import { describe, expect, test } from "bun:test";
import type { CorpusCandidate } from "@auteur/corpus-store/works";
import {
  fetchWork,
  fetchWorks,
  MAX_CONCURRENCY,
  RETRY_DELAYS_MS,
} from "./fetch.ts";

const GUTENBERG = [
  "The Project Gutenberg eBook of Something",
  "",
  "*** START OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
  "",
  "The lamp turned. The sea did not. He counted the revolutions and lost count.",
  "",
  "*** END OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
  "",
  "Licence boilerplate nobody should measure.",
].join("\n");

const book = (overrides: Partial<CorpusCandidate> = {}): CorpusCandidate => ({
  id: "1",
  sourceUrl: "https://x/1.utf8.txt",
  title: "A Work",
  translator: "Garnett, C",
  ...overrides,
});

const noSleep = async (): Promise<void> => undefined;

describe("retries are the politeness budget, not a throughput one", () => {
  test("a 500 retries and then succeeds", async () => {
    let calls = 0;
    const work = await fetchWork(book(), {
      fetch: () => {
        calls += 1;
        return Promise.resolve(
          calls === 1
            ? new Response("", { status: 500 })
            : new Response(GUTENBERG, { status: 200 }),
        );
      },
      sleep: noSleep,
    });
    expect(calls).toBe(2);
    expect(work.text).toContain("The lamp turned.");
    expect(work.text).not.toContain("Licence boilerplate");
  });

  test("a 500 that never recovers gives up after the declared delays", async () => {
    let calls = 0;
    const delays: number[] = [];
    await expect(
      fetchWork(book(), {
        fetch: () => {
          calls += 1;
          return Promise.resolve(new Response("", { status: 500 }));
        },
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toThrow("could not be fetched");
    expect(calls).toBe(RETRY_DELAYS_MS.length + 1);
    expect(delays).toEqual([...RETRY_DELAYS_MS]);
  });

  test("a 404 throws immediately, with no retry", async () => {
    // A 4xx will not become a 2xx by asking again, and retrying one is how a
    // client turns its own bug into someone else's load.
    let calls = 0;
    await expect(
      fetchWork(book(), {
        fetch: () => {
          calls += 1;
          return Promise.resolve(new Response("", { status: 404 }));
        },
        sleep: noSleep,
      }),
    ).rejects.toThrow("could not be fetched");
    expect(calls).toBe(1);
  });

  test("a transport failure retries, because it may be transient", async () => {
    let calls = 0;
    const work = await fetchWork(book(), {
      fetch: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new TypeError("terminated"));
        return Promise.resolve(new Response(GUTENBERG, { status: 200 }));
      },
      sleep: noSleep,
    });
    expect(calls).toBe(2);
    expect(work.wordCount).toBeGreaterThan(0);
  });

  test("text without the Gutenberg markers is corpus_unusable and is not retried", async () => {
    // The cleaner's verdict on text that arrived intact. Retrying fetches the
    // same bytes and reaches the same verdict.
    let calls = 0;
    await expect(
      fetchWork(book(), {
        fetch: () => {
          calls += 1;
          return Promise.resolve(
            new Response("just some prose", { status: 200 }),
          );
        },
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ code: "corpus_unusable" });
    expect(calls).toBe(1);
  });
});

describe("the corpus is fetched at most four at a time", () => {
  test("concurrency never exceeds the budget", async () => {
    let inFlight = 0;
    let peak = 0;
    const books = Array.from({ length: 12 }, (_, index) =>
      book({
        id: (index + 1).toString(),
        sourceUrl: `https://x/${index.toString()}.txt`,
      }),
    );

    const outcomes = await fetchWorks(books, {
      fetch: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Bun.sleep(2);
        inFlight -= 1;
        return new Response(GUTENBERG, { status: 200 });
      },
      sleep: noSleep,
    });

    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENCY);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  }, 20_000);

  test("a work that fails is dropped, and the rest still arrive", async () => {
    // §5.4: the card is built from the rest, cardStrength shows the shortfall,
    // and the stage names what was lost. Refusing the whole corpus for one bad
    // work would turn a low-confidence card into an error.
    const books = [1, 2, 3].map((id) =>
      book({ id: id.toString(), sourceUrl: `https://x/${id.toString()}.txt` }),
    );
    const outcomes = await fetchWorks(books, {
      fetch: (url) =>
        Promise.resolve(
          url.includes("/2.")
            ? new Response("", { status: 404 })
            : new Response(GUTENBERG, { status: 200 }),
        ),
      sleep: noSleep,
    });

    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, false, true]);
    const failure = outcomes[1];
    if (failure?.ok !== false) throw new Error("expected a failure");
    expect(failure.title).toBe("A Work");
  });

  test("outcomes stay in input order, so perWork lines up with selection", async () => {
    const books = [1, 2, 3].map((id) =>
      book({ id: id.toString(), sourceUrl: `https://x/${id.toString()}.txt` }),
    );
    const outcomes = await fetchWorks(
      books,
      {
        fetch: async (url) => {
          // The first is slowest, so a chunked implementation would reorder.
          await Bun.sleep(url.includes("/1.") ? 10 : 1);
          return new Response(GUTENBERG, { status: 200 });
        },
        sleep: noSleep,
      },
      2,
    );
    expect(
      outcomes.map((outcome) => (outcome.ok ? outcome.work.sourceUrl : "")),
    ).toEqual(["https://x/1.txt", "https://x/2.txt", "https://x/3.txt"]);
  }, 20_000);

  test("an empty corpus is an empty list, not a hang", async () => {
    expect(await fetchWorks([], { sleep: noSleep })).toEqual([]);
  });
});

describe("the cleaner version travels with the text it produced", () => {
  test("a fetched work carries the version that cleaned it", async () => {
    // `works` is keyed on (source_url, cleaner_version). Cleaning later would
    // let a row be written under a version it was not cleaned by.
    const work = await fetchWork(book(), {
      fetch: () => Promise.resolve(new Response(GUTENBERG, { status: 200 })),
      sleep: noSleep,
    });
    expect(work.cleanerVersion).toMatch(/^clean-/);
    expect(work.translator).toBe("Garnett, C");
  });
});

describe("a text download says who it is too", () => {
  test("the work fetch carries a User-Agent", async () => {
    // The search and the download hit the same service. Fixing one and not the
    // other would move the 403 from the author list to the corpus fetch, one
    // screen later.
    let seen: Readonly<Record<string, string>> | undefined;
    await fetchWork(book(), {
      fetch: async (_url, init) => {
        seen = init?.headers;
        return new Response(GUTENBERG);
      },
    });

    expect(seen?.["user-agent"]).toContain("auteur/");
    expect(seen?.["accept"]).toBe("text/plain");
  });
});

describe("a download attempt is bounded", () => {
  test("a service that accepts and then says nothing does not hold the stage", async () => {
    // Three attempts and six seconds of backoff have to fit inside a stage. A
    // request with no bound fits inside nothing.
    let attempts = 0;
    const outcome = await fetchWork(book(), {
      fetch: (_url, init) => {
        attempts += 1;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("timed out", "TimeoutError"));
          });
        });
      },
      timeoutMs: 10,
    }).catch((thrown: unknown) => thrown);

    // Every attempt was made and every attempt was bounded.
    expect(attempts).toBe(RETRY_DELAYS_MS.length + 1);
    expect(outcome).toBeInstanceOf(Error);
    // The six seconds this test spends are the retry backoff itself, which is
    // the policy under test: the attempts are spaced, and bounded, and end.
  }, 20_000);
});
