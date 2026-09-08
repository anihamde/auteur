import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  GitBranch,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import type { ComponentType, ReactElement, SVGProps } from "react";
import type { IconName, IconSize } from "./names.ts";

/**
 * The only way to draw an icon.
 *
 * Three things this wrapper does that an import at the use site does not:
 *
 * **The set is closed.** `name` is `IconName`, so a glyph outside the
 * vocabulary does not type-check. The bundle's icon cost is then a property of
 * this file rather than of every import in the repository.
 *
 * **The stroke is locked.** Lucide's default is 2; the design system's chrome
 * is drawn at 1.5, and a component that could pass its own `strokeWidth` is a
 * component that will eventually pass 2 and look wrong beside the others.
 *
 * **It inherits `currentColor`.** No `color` prop and no hex anywhere: an icon
 * with its own colour is an icon that disappears in one of the two grounds.
 *
 * The design system's prototype draws each glyph as a CSS mask over a `unpkg`
 * URL. That is right for a static mockup and wrong for the product — it makes
 * every icon a network request, and one the content-security policy would have
 * to allow. The glyphs are bundled instead.
 */

const GLYPHS: Readonly<
  Record<IconName, ComponentType<SVGProps<SVGSVGElement>>>
> = {
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  check: Check,
  "chevron-down": ChevronDown,
  clock: Clock,
  "git-branch": GitBranch,
  moon: Moon,
  search: Search,
  sun: Sun,
  x: X,
};

/** The design system's chrome weight. Not a prop: see above. */
export const STROKE_WIDTH = 1.5;

export type IconProps = {
  readonly name: IconName;
  /** 14 in dense chrome, 16 default, 20 in headers. */
  readonly size?: IconSize;
  /**
   * The accessible name, when the icon *is* the label.
   *
   * Omitted, the icon is `aria-hidden`: an icon beside a label the reader can
   * already see is noise to a screen reader. Present, it is a graphic with a
   * name. There is no third state, which is what stops an icon-only button
   * from shipping unlabelled.
   */
  readonly label?: string;
};

export const Icon = ({ label, name, size = 16 }: IconProps): ReactElement => {
  const Glyph = GLYPHS[name];
  return (
    <Glyph
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      focusable="false"
      height={size}
      role={label === undefined ? undefined : "img"}
      strokeWidth={STROKE_WIDTH}
      width={size}
    />
  );
};
