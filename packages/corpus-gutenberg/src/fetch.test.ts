import { describe, expect, test } from "bun:test";
import {
  fetchWork,
  fetchWorks,
  MAX_CONCURRENCY,
  plainTextUrl,
  RETRY_DELAYS_MS,
} from "./fetch.ts";
import type { GutendexBook } from "./schema.ts";

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

const book = (overrides: Partial<GutendexBook> = {}): GutendexBook => ({
  authors: [{ birth_year: 1860, death_year: 1904, name: "Chekhov, Anton" }],
  formats: {
    "text/html": "https://x/1.html",
    "text/plain; charset=us-ascii": "https://x/1.ascii.txt",
    "text/plain; charset=utf-8": "https://x/1.utf8.txt",
  },
  id: 1,
  title: "A Work",
  translators: [{ birth_year: null, death_year: null, name: "Garnett, C" }],
  ...overrides,
});

const responding = (
  handler: (url: string) => Response,
): { fetch: (url: string) => Promise<Response>; urls: string[] } => {
  const urls: string[] = [];
  return {
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve(handler(url));
    },
    urls,
  };
};

const noSleep = async (): Promise<void> => undefined;

describe("format selection", () => {
  test("UTF-8 plain text wins over the ascii variant", () => {
    expect(plainTextUrl(book())).toBe("https://x/1.utf8.txt");
  });

  test("a book with no plain-text format yields undefined, and is dropped", () => {
    // Stripping Gutenberg's HTML is a second cleaner with a second set of
    // failure modes, and a measurement over markup that leaked through is
    // worse than a missing work because nothing about it looks wrong.
    expect(
      plainTextUrl(book({ formats: { "text/html": "https://x/1.html" } })),
    ).toBeUndefined();
  });
});

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

  test("a book with no plain-text format is corpus_unusable before any request", async () => {
    const { fetch: call, urls } = responding(
      () => new Response("", { status: 200 }),
    );
    await expect(
      fetchWork(book({ formats: { "text/html": "https://x/1.html" } }), {
        fetch: call,
      }),
    ).rejects.toMatchObject({ code: "corpus_unusable" });
    expect(urls).toEqual([]);
  });
});

describe("the corpus is fetched at most four at a time", () => {
  test("concurrency never exceeds the budget", async () => {
    let inFlight = 0;
    let peak = 0;
    const books = Array.from({ length: 12 }, (_, index) =>
      book({
        formats: { "text/plain": `https://x/${index.toString()}.txt` },
        id: index + 1,
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
      book({ formats: { "text/plain": `https://x/${id.toString()}.txt` }, id }),
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
      book({ formats: { "text/plain": `https://x/${id.toString()}.txt` }, id }),
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
