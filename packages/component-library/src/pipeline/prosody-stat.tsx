import type { HTMLAttributes, ReactElement } from "react";
import { STATUS_COLOURS, type Status, token } from "../styles.ts";

/**
 * One deterministic measurement, optionally plotted against the corpus band.
 *
 * **There is no `ground` prop, and that is deliberate.** A measurement never
 * sits on paper: paper is the artifact and measurement is the instrument
 * (§8.1). A `ground="paper"` here would let a number be styled as though it
 * were part of the story.
 *
 * The target is drawn as a **hairline tick**, visibly different from the value
 * marker — they are different claims, and a reader who cannot tell them apart
 * cannot read the plot at all.
 */
export type ProsodyStatProps = HTMLAttributes<HTMLDivElement> & {
  readonly label: string;
  readonly value: number | string;
  readonly unit?: string;
  /** `[min, max]` axis. Omit for a bare label/value row. */
  readonly band?: readonly [number, number];
  readonly target?: number;
  readonly status?: Status;
};

/** Where a value sits on the band, as a percentage, clamped to the axis. */
export const positionOn = (
  band: readonly [number, number],
  value: number,
): number => {
  const [min, max] = band;
  if (max === min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
};

export const ProsodyStat = ({
  band,
  label,
  status = "neutral",
  style,
  target,
  unit,
  value,
  ...rest
}: ProsodyStatProps): ReactElement => {
  const numeric = typeof value === "number" ? value : Number.NaN;
  return (
    <div
      data-status={status}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("stack-tight"),
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span
          style={{ color: token("text-muted"), fontSize: token("text-2xs") }}
        >
          {label}
        </span>
        <span
          style={{
            color: STATUS_COLOURS[status],
            fontFamily: token("font-data"),
            fontSize: token("text-xs"),
          }}
        >
          {value}
          {unit}
        </span>
      </div>
      {band === undefined || Number.isNaN(numeric) ? undefined : (
        <div
          data-band="true"
          style={{
            background: token("surface-raised"),
            borderRadius: token("radius-round"),
            height: token("rule-medium"),
            position: "relative",
          }}
        >
          {target === undefined ? undefined : (
            <span
              data-target="true"
              style={{
                background: token("text-muted"),
                bottom: token("space-0"),
                insetInlineStart: `${positionOn(band, target).toString()}%`,
                position: "absolute",
                top: token("space-0"),
                width: token("rule-hairline"),
              }}
            />
          )}
          <span
            data-marker="true"
            style={{
              background: STATUS_COLOURS[status],
              borderRadius: token("radius-round"),
              height: token("space-1-5"),
              insetInlineStart: `${positionOn(band, numeric).toString()}%`,
              position: "absolute",
              top: token("space-0"),
              width: token("space-1-5"),
            }}
          />
        </div>
      )}
    </div>
  );
};
