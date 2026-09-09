import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import { upsertAuthor } from "@auteur/corpus-store/authors";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { requireSession, updateSession } from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { idOf } from "./_id.ts";
import { type AdvanceDeps, enqueueStaleUpTo } from "./advance.ts";

/**
 * `POST /api/sessions/:id/author` — choose whose evidence the run reads.
 *
 * It is the second of the two moments work begins. The research screen shows
 * four stages running and does not ask for them: nothing on that screen calls
 * `advance`, because by the time it renders the corpus is already being
 * fetched. Choosing the author is what started it.
 *
 * **It is also where an author becomes a row.** `sessions.author_id`
 * references `authors(id)`, and search never writes that table: typing a name
 * must not fetch a corpus. So the choice carries the row the screen is already
 * showing, and it is recorded here — before the reference to it.
 *
 * **What is stale is computed, not decided here.** A new author changes
 * `session.authorId`, which is a direct input to `corpus-select`, which every
 * stage after it reads — so §7.5's key computation restales the run and this
 * route enqueues whatever that produced. Re-choosing the same author restales
 * nothing and enqueues nothing, which is the same property that makes the
 * completed rail rows free to click.
 */

/**
 * Which provider an id belongs to.
 *
 * The column admits one value today and the id says which it is, so this reads
 * rather than assumes — a secondary tier (PRD §8) arrives as a second prefix,
 * and an id from neither is a client sending something it did not get from
 * search.
 */
const PROVIDERS = ["gutenberg"] as const;

const providerOf = (id: string): (typeof PROVIDERS)[number] => {
  const found = PROVIDERS.find((provider) => id.startsWith(`${provider}:`));
  if (found === undefined) {
    throw new AuteurError(
      "invalid_input",
      "That author id names no provider this system knows.",
    );
  }
  return found;
};
export type SelectAuthorDeps = AdvanceDeps & { readonly db: Db };

export const selectAuthorRoutes = (deps: SelectAuthorDeps): Hono => {
  const routes = new Hono();

  routes.post(ROUTES.selectAuthor.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("selectAuthor", await context.req.json());
    // 404s a session that does not exist, before writing anything.
    await requireSession(deps.db, id);

    const { author } = body;
    // Before the session references it: the foreign key is checked on write,
    // and an author nobody has stored is one no session can point at.
    await upsertAuthor(deps.db, {
      birthYear: author.birthYear,
      deathYear: author.deathYear,
      displayName: author.displayName,
      id: author.id,
      kind: author.kind,
      measuredWords: author.measuredWords ?? null,
      provider: providerOf(author.id),
      workCount: author.workCount,
    });
    await updateSession(deps.db, id, { authorId: author.id });

    return context.json({
      enqueued: await enqueueStaleUpTo(deps, id, "research"),
    });
  });

  return routes;
};
