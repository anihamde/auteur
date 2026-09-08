/** The model-selection overlay. */
export const models = {
  columns: {
    model: "Model",
    perMillionIn: "per 1M in",
    stage: "Stage",
    tier: "Tier",
  },
  eyebrow: "Models",
  followDefaults: "Follow tier defaults",
  /**
   * The control the design does not have (`ARCHITECTURE.md` §6.3): one model
   * for every stage. It is validated per stage like any other pin, so a model
   * that cannot emit a strict schema is refused for the typed stages with the
   * reason rather than silently applied to the draft alone.
   */
  oneModelLabel: "Use one model for every stage",
  /** Shown when a pin is refused. Names the stage and the reason. */
  pinRefused: "That model cannot run this stage",
  subtitle:
    "Each stage asks the router for a tier. A tier resolves to a model from the catalog at run time — override any stage and the choice is pinned for this session.",
  title: "Which model runs which stage",
} as const;
