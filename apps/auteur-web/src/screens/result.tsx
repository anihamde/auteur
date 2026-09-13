import {
  Badge,
  Button,
  Card,
  CardHeader,
} from "@auteur/component-library/core";
import { ProsodyStat } from "@auteur/component-library/pipeline";
import { Markdown } from "@auteur/component-library/prose";
import { COPY } from "@auteur/copy/index";
import { type ReactElement, useEffect, useState } from "react";
import type { ScreenProps } from "../shell/app.tsx";
import { browserSaver, fileNameFor, saveText } from "./download.ts";

/**
 * Screen 7 — the story, how well it matched, and what was decided for you.
 *
 * The three tabs are **three reads of one response**. `GET /api/sessions/:id`
 * already carries the story, the report and the decisions log (§7.1), so
 * switching tabs issues no request — which is also what stops a tab from
 * showing a different session's state than the one beside it.
 *
 * The story leaves by two routes. **Markdown** is `GET /api/sessions/:id/export`
 * — the story, §7.6's label, the fit report and the decisions log, which is
 * more than any tab shows — fetched through the client because every public
 * route wants the bearer token, and handed over as a blob. **Print** is the
 * browser's own dialogue, which is where a PDF comes from without this app
 * carrying a PDF writer; `data-print="chrome"` is what the rail, the tabs and
 * the controls are marked with so the page that prints is the story.
 */

export type ResultTab = "story" | "fit" | "decisions";

/** The §7.6 label, with the author's name in it. */
export const attributionFor = (authorName: string): string =>
  COPY.result.attribution.replace("{author}", authorName);

export const ResultScreen = ({
  sessionId,
  state,
  transport,
}: ScreenProps): ReactElement => {
  const [tab, setTab] = useState<ResultTab>("story");
  const [selection, setSelection] = useState<
    { readonly from: number; readonly to: number } | undefined
  >(undefined);

  const view = state.view;
  const author = view?.card?.author.displayName ?? "";
  const markdown = view?.story?.markdown ?? "";

  // `selectionchange` on the document rather than `onMouseUp` on the prose: a
  // selection made with the keyboard, or extended after the mouse is released,
  // is a selection too — and a handler on a static element is an interaction
  // a keyboard user cannot reach at all.
  //
  // The offsets are found by locating the selected text in the markdown, not
  // by reading DOM ranges: the API's span is a range into `stories.markdown`,
  // and the rendered DOM has inserted elements the source does not.
  useEffect(() => {
    const onSelectionChange = (): void => {
      const active = globalThis.getSelection?.();
      const text = active?.toString() ?? "";
      if (text.trim() === "") {
        setSelection(undefined);
        return;
      }
      const from = markdown.indexOf(text);
      setSelection(from === -1 ? undefined : { from, to: from + text.length });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [markdown]);

  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  const exportMarkdown = async (): Promise<void> => {
    if (sessionId === undefined) return;
    setExporting(true);
    setFailed(false);
    try {
      const markdown = await transport.client.call("exportStory", {
        params: { id: sessionId },
      });
      saveText(
        {
          fileName: fileNameFor(view?.story?.title, "md"),
          mediaType: "text/markdown;charset=utf-8",
          text: markdown,
        },
        browserSaver(),
      );
    } catch {
      // The reason is on the wire and in the log; the reader's move is the
      // same for every one of them, and a code in the interface would be a
      // code they cannot act on.
      setFailed(true);
    } finally {
      setExporting(false);
    }
  };

  const regenerateSelection = async (): Promise<void> => {
    if (sessionId === undefined || selection === undefined) return;
    await transport.client.call("regenerate", {
      body: { from: selection.from, kind: "selection", to: selection.to },
      params: { id: sessionId },
    });
    setSelection(undefined);
  };

  return (
    <>
      <CardHeader
        meta={COPY.shell.steps.result}
        title={view?.story?.title ?? COPY.shell.steps.result}
      />
      <div
        data-print="chrome"
        role="tablist"
        style={{ display: "flex", gap: "var(--inline)" }}
      >
        {(["story", "fit", "decisions"] as const).map((candidate) => (
          <Button
            aria-selected={tab === candidate}
            key={candidate}
            onClick={() => {
              setTab(candidate);
            }}
            role="tab"
            variant={tab === candidate ? "secondary" : "ghost"}
          >
            {COPY.result.tabs[candidate]}
          </Button>
        ))}
      </div>

      {tab === "story" ? (
        <Card ground="paper" padding="lg">
          <Markdown ground="paper">{view?.story?.markdown ?? ""}</Markdown>
          {/* The label renders on the story view as well as in the export.
              PRD §9 requires both, and this is the view half. */}
          <p>{attributionFor(author)}</p>
          <div
            data-print="chrome"
            style={{ display: "flex", gap: "var(--inline)" }}
          >
            <Button
              disabled={selection === undefined}
              onClick={() => void regenerateSelection()}
              variant="ghost"
            >
              {COPY.result.regenerateSection}
            </Button>
            <Button
              disabled={exporting || view?.story === undefined}
              onClick={() => void exportMarkdown()}
              variant="secondary"
            >
              {exporting
                ? COPY.result.exportWorking
                : COPY.result.exportMarkdown}
            </Button>
            <Button
              disabled={view?.story === undefined}
              onClick={() => {
                globalThis.print();
              }}
              variant="ghost"
            >
              {COPY.result.exportPdf}
            </Button>
          </div>
          {/* Announced rather than only coloured: the export is the one action
              on this screen whose failure leaves nothing behind to look at. */}
          {failed ? <p role="alert">{COPY.result.exportFailed}</p> : undefined}
        </Card>
      ) : undefined}

      {tab === "fit" ? (
        <Card ground="ink" padding="lg">
          <p>{view?.report?.summary ?? ""}</p>
          {(view?.report?.measures ?? []).map((measure) => (
            <ProsodyStat
              band={measure.band}
              key={measure.path}
              label={measure.label}
              status={
                measure.status === "insufficient-length"
                  ? "neutral"
                  : measure.status
              }
              target={measure.targetValue}
              value={measure.value}
            />
          ))}
        </Card>
      ) : undefined}

      {tab === "decisions" ? (
        <Card ground="ink" padding="lg">
          {(view?.decisions ?? []).map((entry) => (
            <div key={`${entry.origin}-${entry.decision}`}>
              <Badge
                tone={entry.origin === "you answered" ? "measured" : "edited"}
              >
                {entry.origin}
              </Badge>
              <p>{entry.decision}</p>
              <p>{entry.reason}</p>
            </div>
          ))}
        </Card>
      ) : undefined}

      <p data-print="chrome">{COPY.result.reEnterable}</p>
    </>
  );
};
