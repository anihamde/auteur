import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { token } from "../styles.ts";

/**
 * The wizard's fixed left rail.
 *
 * **Completed steps stay clickable and pending steps do not.** That is
 * invariant 3 as an affordance: every step is re-enterable, and a step the
 * reader has not reached is not a step they can jump to. A rail that made every
 * row clickable would promise a jump the pipeline cannot honour.
 */
export type WizardStep = {
  readonly id?: string;
  readonly label: string;
  /** Right-aligned mono note — a count or a duration. */
  readonly note?: string;
};

export type WizardRailProps = HTMLAttributes<HTMLElement> & {
  readonly steps: readonly WizardStep[];
  /** Zero-based index of the active step. */
  readonly current?: number;
  /** Omit to make the rail read-only. */
  readonly onStep?: (index: number) => void;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
};

export const WizardRail = ({
  current = 0,
  footer,
  header,
  onStep,
  steps,
  style,
  ...rest
}: WizardRailProps): ReactElement => (
  <nav
    aria-label="Steps"
    style={{
      background: token("surface-panel"),
      display: "flex",
      flexDirection: "column",
      gap: token("stack"),
      padding: token("gutter-panel"),
      width: token("rail-width"),
      ...style,
    }}
    {...rest}
  >
    {header}
    <ol
      style={{
        listStyle: "none",
        margin: token("space-0"),
        padding: token("space-0"),
      }}
    >
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const reachable = done && onStep !== undefined;
        return (
          <li key={step.id ?? step.label}>
            <button
              aria-current={active ? "step" : undefined}
              data-state={done ? "done" : active ? "active" : "pending"}
              disabled={!reachable}
              onClick={reachable ? () => onStep(index) : undefined}
              style={{
                background: "none",
                borderStyle: "none",
                color: active
                  ? token("text-strong")
                  : done
                    ? token("text-body")
                    : token("text-muted"),
                cursor: reachable ? "pointer" : "default",
                display: "flex",
                fontFamily: token("font-ui"),
                fontSize: token("text-sm"),
                gap: token("inline"),
                justifyContent: "space-between",
                paddingBlock: token("space-1-5"),
                paddingInline: token("space-0"),
                textAlign: "start",
                width: "100%",
              }}
              type="button"
            >
              <span>{step.label}</span>
              {step.note === undefined ? undefined : (
                <span
                  style={{
                    color: token("text-muted"),
                    fontFamily: token("font-data"),
                    fontSize: token("text-2xs"),
                  }}
                >
                  {step.note}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
    {footer}
  </nav>
);
