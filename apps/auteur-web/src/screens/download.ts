/**
 * Handing a generated document to the reader.
 *
 * The export route is authenticated — every public route requires the bearer
 * token — so a plain `<a href="/api/.../export" download>` fetches an
 * unauthenticated URL and downloads a 401 body under the story's filename. The
 * bytes have to come through the client that holds the token, which means they
 * arrive as a string and leave as a blob.
 *
 * The document's surroundings are injected rather than reached for. `document`,
 * `URL` and the clock are globals a test would otherwise have to stand up a DOM
 * for, and the interesting behaviour here — the filename, and *when* the object
 * URL is revoked — is not DOM behaviour.
 */

export type Saver = {
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  /** A detached anchor. Never appended: a click on one is enough. */
  readonly anchor: () => {
    download: string;
    href: string;
    readonly click: () => void;
  };
  /** Run this later, after the download the click started has begun. */
  readonly later: (task: () => void) => void;
};

/**
 * How long the blob URL outlives the click.
 *
 * `anchor.click()` **queues** the fetch of the blob rather than performing it.
 * Firefox reads the URL when that fetch runs, so revoking in the same tick
 * removes the entry first: the export succeeds, no error is thrown, no alert
 * renders, and no file is written — a control that reports success and produces
 * nothing. Chrome happens to resolve the blob handle during click dispatch,
 * which is a browser's implementation detail and not a guarantee.
 *
 * Forty seconds is `file-saver`'s number and it is a ceiling rather than a
 * wait: the download has begun long before, and this only decides when the
 * memory goes back.
 */
export const REVOKE_AFTER_MS = 40_000;

export const browserSaver = (): Saver => ({
  anchor: () => document.createElement("a"),
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  later: (task) => {
    setTimeout(task, REVOKE_AFTER_MS);
  },
  revokeObjectUrl: (url) => {
    URL.revokeObjectURL(url);
  },
});

/** Characters a filename may carry, and the length beyond which nobody reads it. */
const UNSAFE = /[^\p{Letter}\p{Number}]+/gu;
const LONGEST = 60;

/**
 * A filename from a story's title.
 *
 * A title is model output and reaches the filesystem, so it is stripped to
 * letters, numbers and hyphens rather than escaped — invariant 4 in the one
 * direction people forget, and the reason `../` and a leading dot cannot
 * survive it. A title of nothing but punctuation leaves an empty stem, which is
 * the case the fallback is for and not a title worth preserving.
 */
export const fileNameFor = (
  title: string | null | undefined,
  extension: string,
): string => {
  const stem = (title ?? "")
    .normalize("NFKD")
    .replace(UNSAFE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LONGEST)
    .replace(/-+$/, "")
    .toLowerCase();
  return `${stem === "" ? "story" : stem}.${extension}`;
};

/**
 * Save a text document under a name.
 *
 * The revoke is scheduled **before** the click rather than after it. Scheduling
 * first is what makes the leak impossible without a `try`: a click that throws
 * has already handed the URL to something that will free it, and a `finally`
 * that freed it immediately is the defect above.
 */
export const saveText = (
  input: {
    readonly text: string;
    readonly fileName: string;
    readonly mediaType: string;
  },
  saver: Saver,
): void => {
  const url = saver.createObjectUrl(
    new Blob([input.text], { type: input.mediaType }),
  );
  saver.later(() => {
    saver.revokeObjectUrl(url);
  });
  const anchor = saver.anchor();
  anchor.download = input.fileName;
  anchor.href = url;
  anchor.click();
};
