/**
 * Auto / Light / Dark segmented control.
 *
 * @startingPoint section="Auteur Web" subtitle="Theme control — auto resolves by local clock" viewport="700x150"
 */
export interface ThemeToggleProps {
  /** Controlled mode. Omit to let the component track window.AuteurTheme. */
  mode?: 'auto' | 'light' | 'dark';
  /** Fired with the chosen mode. */
  onChange?: (mode: 'auto' | 'light' | 'dark') => void;
  /** 26px default, 22px in dense chrome. */
  size?: 'sm' | 'md';
  /** Show the word beside each glyph. Icon-only by default. */
  showLabels?: boolean;
  style?: React.CSSProperties;
}
export declare function ThemeToggle(props: ThemeToggleProps): JSX.Element;
