/**
 * Batching draft deltas.
 *
 * `ARCHITECTURE.md` §5.3: a token-per-event stream costs one database write and
 * one `NOTIFY` per token, which is untenable when every event is durable. So
 * deltas are accumulated and flushed **every ~250ms or at a paragraph boundary,
 * whichever comes first**.
 *
 * Both halves matter and they solve different problems. The time bound keeps a
 * fast model from batching a whole page before anything appears. The paragraph
 * bound keeps a slow one from flushing a half-sentence — and a paragraph is
 * also the unit `drift.ts` measures on, so flushing there means the drift event
 * and the text it describes arrive together.
 */

export const FLUSH_INTERVAL_MS = 250;

/** Two newlines: the boundary `text`'s block splitter uses. */
const PARAGRAPH = /\n\s*\n/;

export type FlushConfig = {
  /** Injected so a test can drive time rather than wait for it. */
  readonly now: () => number;
  readonly intervalMs?: number;
};

export type Flusher = {
  /** Add a delta. Returns text to emit, or `undefined` to keep accumulating. */
  readonly push: (delta: string) => string | undefined;
  /** Emit whatever is held. Called when the stream ends. */
  readonly drain: () => string | undefined;
  readonly pending: () => string;
};

export const createFlusher = (config: FlushConfig): Flusher => {
  const interval = config.intervalMs ?? FLUSH_INTERVAL_MS;
  let buffer = "";
  let lastFlush = config.now();

  const flush = (): string | undefined => {
    if (buffer.length === 0) return undefined;
    const out = buffer;
    buffer = "";
    lastFlush = config.now();
    return out;
  };

  return {
    drain: flush,
    pending: () => buffer,
    push: (delta) => {
      buffer += delta;
      // The paragraph check reads the *buffer* rather than the delta: a
      // boundary split across two deltas — "…end.\n" then "\nNext…" — is the
      // ordinary case with a token stream, and checking the delta alone would
      // miss every one of them.
      if (PARAGRAPH.test(buffer)) return flush();
      if (config.now() - lastFlush >= interval) return flush();
      return undefined;
    },
  };
};
