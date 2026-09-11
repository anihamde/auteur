# The worker that drains `stage_queue`, and nothing else.
#
# The routes, the client and the SSE stream stay on Vercel: they answer a
# browser in milliseconds and a serverless function is the right shape for that.
# What does not fit there is a stage — `style-fields` and `style-extract` each
# need more than the sixty seconds an invocation is allowed, measured, and
# splitting the work made the total worse. Decision 0032.
#
# Bun rather than Node, unlike the Vercel function: that one is bundled for a
# Node runtime because the platform provides one, and gate 16 keeps Bun-only
# globals off it. Here the runtime is this image's to choose, and Bun runs the
# TypeScript sources directly — no bundling step, so what runs in production is
# what the tests import.
FROM oven/bun:1.3.11-slim AS deps

WORKDIR /app
# The lockfile and every manifest first, so a source edit does not re-resolve
# the dependency graph. `--frozen-lockfile` because a build that silently
# resolves a different tree is a build that tested something else.
COPY bun.lock package.json ./
COPY apps/auteur-web/package.json apps/auteur-web/
COPY packages packages
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.11-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY apps/auteur-web/server apps/auteur-web/server
COPY apps/auteur-web/tsconfig.json apps/auteur-web/

# Not root. The worker reads a database and calls a gateway; it has no reason to
# be able to write to its own image.
USER bun

CMD ["bun", "run", "apps/auteur-web/server/worker-entry.ts"]
