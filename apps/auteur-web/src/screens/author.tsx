import type { ResponseOf } from "@auteur/api-contract/contract";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Icon,
} from "@auteur/component-library/core";
import { Field, Input } from "@auteur/component-library/forms";
import { COPY } from "@auteur/copy/index";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { ScreenProps } from "../shell/app.tsx";

/** How long the field waits before searching. §5.3's search-as-you-type. */
export const DEBOUNCE_MS = 250;

type AuthorRow = ResponseOf<"authors">["results"][number];

/**
 * Screen 2 — pick the author.
 *
 * The search **debounces and aborts**: a keystroke that arrives while a request
 * is in flight cancels it, so the list cannot be overwritten by an answer to a
 * question the reader has already moved past. Without the abort the last
 * response wins rather than the last query, which on a slow connection means
 * results for a prefix.
 */
export const AuthorScreen = ({
  sessionId,
  setState,
  transport,
}: ScreenProps): ReactElement => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly AuthorRow[]>([]);
  const [unavailable, setUnavailable] = useState<readonly string[]>([]);
  const inFlight = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (query.trim() === "") {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      void transport.client
        .call("authors", { query: { q: query }, signal: controller.signal })
        .then((response) => {
          setResults(response.results);
          setUnavailable(response.unavailable);
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [query, transport]);

  const choose = async (authorId: string): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("selectAuthor", {
      body: { authorId },
      params: { id: sessionId },
    });
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
  };

  return (
    <Card ground="panel" padding="lg">
      <CardHeader meta={COPY.shell.steps.author} title={COPY.author.title} />
      <p>{COPY.author.subtitle}</p>
      <Field htmlFor="author-search" label={COPY.author.searchPlaceholder}>
        <Input
          icon={<Icon name="search" size={14} />}
          id="author-search"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          value={query}
        />
      </Field>
      {unavailable.length > 0 ? (
        <p role="status">
          {unavailable.join(", ")} unavailable — this list is short.
        </p>
      ) : undefined}
      <ul style={{ listStyle: "none", padding: "0" }}>
        {results.map((author) => (
          <li key={author.id}>
            <Card
              ground="ink"
              interactive={author.kind === "full-text"}
              padding="sm"
            >
              <div style={{ display: "flex", gap: "var(--inline)" }}>
                <span>{author.displayName}</span>
                <Badge
                  tone={author.kind === "full-text" ? "measured" : "neutral"}
                >
                  {author.kind === "full-text"
                    ? COPY.author.tierFullText
                    : COPY.author.tierSecondary}
                </Badge>
              </div>
              {/* Assembled by the server (§5.3): a component choosing which of
                  the three sentences to render would be a component deciding
                  what is known. */}
              <p>{author.detail}</p>
              {author.kind === "full-text" ? (
                <Button onClick={() => void choose(author.id)}>
                  {COPY.author.next}
                </Button>
              ) : (
                <p>{COPY.author.secondaryReason}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <p>{COPY.author.invalidation}</p>
    </Card>
  );
};
