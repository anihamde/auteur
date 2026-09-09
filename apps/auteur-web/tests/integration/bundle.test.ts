import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { bundleFunction } from "../../../../scripts/build-vercel.ts";

/**
 * The deployment, run.
 *
 * Every other suite here imports source and runs it under Bun. The deployment
 * runs a **bundle**, under **Node**, against an **empty database**, and each of
 * those three has already produced a failure that no source-level test could
 * see: a workspace package exporting `.ts` that Node cannot import, a Bun
 * global that does not exist there, and a migration lock taken on a pooled
 * handle that cannot hold one.
 *
 * So this builds the artifact, starts it under Node in a child process, and
 * asks it for three things. It is slow — a bundle and a process — and it is the
 * only test in the repository that answers "would the deploy work".
 */

const TOKEN = "a-token-of-at-least-16-chars";

let harness: TestDb;
let dir: string;
let result: { health: number; unauthorized: number; created: number };

beforeAll(async () => {
  // A database with nothing in it: the schema arriving on first request is
  // half of what is under test, and a migrated harness would skip it.
  harness = await createTestDb({ migrate: false });
  dir = await mkdtemp(join(tmpdir(), "auteur-bundle-"));

  await writeFile(join(dir, "index.mjs"), await bundleFunction());
  await writeFile(
    join(dir, "probe.mjs"),
    `import { createServer } from "node:http";
import handler from "./index.mjs";

const server = createServer(handler);
await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
const at = (path) => \`http://127.0.0.1:\${port}\${path}\`;

const health = await fetch(at("/api/health"));
const unauthorized = await fetch(at("/api/models"));
const created = await fetch(at("/api/sessions"), {
  body: JSON.stringify({ idea: "a lighthouse keeper", lengthPreset: "flash" }),
  headers: {
    authorization: "Bearer ${TOKEN}",
    "content-type": "application/json",
  },
  method: "POST",
});

process.stdout.write(
  JSON.stringify({
    created: created.status,
    health: health.status,
    unauthorized: unauthorized.status,
  }),
);
server.close();
process.exit(0);
`,
  );

  const proc = Bun.spawn(["node", join(dir, "probe.mjs")], {
    env: {
      ...process.env,
      AUTEUR_API_TOKEN: TOKEN,
      AUTEUR_STAGE_SECRET: "a-stage-secret-of-16-plus",
      CRON_SECRET: "a-cron-secret-of-16-plus",
      DATABASE_URL: harness.url,
      DATABASE_URL_DIRECT: harness.url,
      RAMP_ROUTER_API_KEY: "not-called-by-these-three-requests",
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`the bundle did not run under node:\n${err}\n${out}`);
  }
  result = JSON.parse(out) as typeof result;
}, 120_000);

afterAll(async () => {
  await harness.close();
  await rm(dir, { force: true, recursive: true });
});

describe("the bundled function runs under node", () => {
  test("health answers on an empty database, having migrated it", () => {
    // The schema comes up on access; there is no release phase. The slow path
    // holds a session-level advisory lock, which a pooled handle cannot do —
    // and every other suite hands it a direct handle, so nothing else here has
    // ever exercised the arrangement the deployment uses.
    expect(result.health).toBe(200);
  });

  test("a route with no token is refused", () => {
    expect(result.unauthorized).toBe(401);
  });

  test("a session is created with the token", () => {
    // Reaches the contract, the store and Postgres through the bundle rather
    // than through the module graph a test normally imports.
    expect(result.created).toBe(201);
  });
});
