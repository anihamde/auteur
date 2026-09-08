#!/usr/bin/env bun
/**
 * What the gateway's model list says about the catalogue.
 *
 * The models route is the OpenAI model-list shape: an id, an owner and a
 * timestamp. It carries no context window, no max output, no structured-output
 * support and no price — so it can **filter** the catalogue and could never
 * build it. Two things it can tell us, and they are both worth knowing:
 *
 *  - a catalogue row the gateway no longer serves, which is a pin waiting to
 *    fail mid-session;
 *  - a model the gateway serves that the catalogue has never heard of, which
 *    is a row somebody could add.
 *
 * With no key it reports what it can: the catalogue's own state, and that every
 * capability column is **unverified**. That is deliberately not "clean" — a
 * script that printed a tick against a table nobody has measured would be the
 * thing this whole arrangement exists to prevent.
 */
import { CATALOGUE } from "../packages/provider-router/src/models.ts";

export type Drift = {
  readonly missingFromGateway: readonly string[];
  readonly absentFromCatalogue: readonly string[];
};

export const compare = (
  catalogueIds: readonly string[],
  gatewayIds: readonly string[],
): Drift => {
  const gateway = new Set(gatewayIds);
  const catalogue = new Set(catalogueIds);
  return {
    absentFromCatalogue: gatewayIds.filter((id) => !catalogue.has(id)),
    missingFromGateway: catalogueIds.filter((id) => !gateway.has(id)),
  };
};

const summariseUnverified = (): string => {
  const declared = CATALOGUE.filter((row) => row.source === "declared");
  return [
    `${CATALOGUE.length.toString()} catalogue row(s).`,
    `${declared.length.toString()} carry capability columns that are UNVERIFIED —`,
    "  structuredOutput and maxOutputTokens came from published documentation,",
    "  not from asking the gateway. WP-X0 measures them.",
    "",
    "Rows believed to accept a strict json_schema:",
    ...CATALOGUE.filter((row) => row.structuredOutput).map(
      (row) => `  ${row.id}`,
    ),
    "",
    "Rows believed not to, which no typed stage may resolve to:",
    ...CATALOGUE.filter((row) => !row.structuredOutput).map(
      (row) => `  ${row.id}`,
    ),
  ].join("\n");
};

if (import.meta.main) {
  process.stdout.write(`${summariseUnverified()}\n`);
  const key = Bun.env["RAMP_ROUTER_API_KEY"];
  if (key === undefined || key === "") {
    process.stdout.write(
      "\nNo RAMP_ROUTER_API_KEY, so the gateway was not asked. This is\n" +
        "UNVERIFIED, not clean.\n",
    );
  }
}
