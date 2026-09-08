import type { ResponseOf } from "@auteur/api-contract/contract";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Icon,
} from "@auteur/component-library/core";
import { Select } from "@auteur/component-library/forms";
import { COPY } from "@auteur/copy/index";
import { type ReactElement, useEffect, useState } from "react";
import type { Transport } from "../shell/session-state.ts";

/**
 * The model overlay, including "use one model for every stage".
 *
 * The one-model control writes **seven pins in one request**, because the write
 * is all-or-nothing: a model that cannot emit a strict schema is refused for
 * the typed stages and nothing is applied. Sending seven requests would apply
 * the four that were fine and leave a pipeline running two models the reader
 * never chose together.
 */
export type ModelsOverlayProps = {
  readonly transport: Transport;
  readonly sessionId?: string;
  readonly onClose: () => void;
};

type Catalogue = ResponseOf<"models">;

export const ModelsOverlay = ({
  onClose,
  sessionId,
  transport,
}: ModelsOverlayProps): ReactElement => {
  const [catalogue, setCatalogue] = useState<Catalogue | undefined>(undefined);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  useEffect(() => {
    void transport.client.call("models", {}).then(setCatalogue);
  }, [transport]);

  const write = async (next: Record<string, string>): Promise<void> => {
    if (sessionId === undefined) return;
    try {
      const response = await transport.client.call("pins", {
        body: { pins: next },
        params: { id: sessionId },
      });
      setPins(response.pins);
      setRefusal(undefined);
    } catch (thrown) {
      // Named, not swallowed: the reader chose a model and is owed the reason
      // it cannot run.
      setRefusal(
        thrown instanceof Error ? thrown.message : COPY.models.pinRefused,
      );
    }
  };

  const tiered = (catalogue?.stages ?? []).filter(
    (stage) => stage.tier !== null,
  );

  return (
    <dialog aria-label={COPY.models.title} open>
      <CardHeader
        action={
          <Button onClick={onClose} variant="ghost">
            <Icon label="Close" name="x" size={16} />
          </Button>
        }
        meta={COPY.models.eyebrow}
        title={COPY.models.title}
      />
      <p>{COPY.models.subtitle}</p>

      <Card ground="ink" padding="sm">
        <label htmlFor="one-model">{COPY.models.oneModelLabel}</label>
        <Select
          id="one-model"
          onChange={(event) => {
            const modelId = event.target.value;
            if (modelId === "") return;
            void write(
              Object.fromEntries(
                tiered.map((stage) => [stage.stageId, modelId]),
              ),
            );
          }}
          options={[
            "",
            ...(catalogue?.models ?? []).map((model) => ({
              label: model.displayName,
              value: model.id,
            })),
          ]}
        />
      </Card>

      {refusal === undefined ? undefined : <p role="alert">{refusal}</p>}

      <table>
        <thead>
          <tr>
            <th>{COPY.models.columns.stage}</th>
            <th>{COPY.models.columns.tier}</th>
            <th>{COPY.models.columns.model}</th>
          </tr>
        </thead>
        <tbody>
          {(catalogue?.stages ?? []).map((stage) => (
            <tr key={stage.stageId}>
              <td>{stage.stageId}</td>
              <td>
                {stage.tier === null ? undefined : (
                  <Badge tone={stage.tier}>{stage.tier}</Badge>
                )}
              </td>
              <td>
                {stage.tier === null ? (
                  "—"
                ) : (
                  <Select
                    aria-label={stage.stageId}
                    onChange={(event) => {
                      void write({
                        ...pins,
                        [stage.stageId]: event.target.value,
                      });
                    }}
                    options={(catalogue?.models ?? []).map((model) => ({
                      label: model.displayName,
                      value: model.id,
                    }))}
                    value={pins[stage.stageId] ?? stage.modelId ?? ""}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Clearing every pin is a write of the empty set, not a second route. */}
      <Button onClick={() => void write({})} variant="ghost">
        {COPY.models.followDefaults}
      </Button>
    </dialog>
  );
};
