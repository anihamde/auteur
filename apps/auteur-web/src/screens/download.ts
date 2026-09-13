/**
 * Handing a generated document to the reader.
 *
 * The export route is authenticated — every public route requires the bearer
 * token — so a plain `<a href="/api/.../export" download>` fetches an
 * unauthenticated URL and downloads a 401 body under the story's filename. The
 * bytes have to come through the client that holds the token, which means they
 * arrive as a string and leave as a blob.
 *
 * The document's surroundings are injected rather than reached for. `document`
 * and `URL` are globals a test would otherwise have to stand up a DOM for, and
 * the interesting behaviour here — the filename, and the object URL being
 * revoked whatever happens — is not DOM behaviour.
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
};

export const browserSaver = (): Saver => ({
  anchor: () => document.createElement("a"),
  createObjectUrl: (blob) => URL.createObjectURL(blob),
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
 * The object URL is revoked in a `finally`, so a click handler that throws does
 * not leak the whole document for the life of the tab.
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
  try {
    const anchor = saver.anchor();
    anchor.download = input.fileName;
    anchor.href = url;
    anchor.click();
  } finally {
    saver.revokeObjectUrl(url);
  }
};
