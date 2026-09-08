#!/usr/bin/env bun
import { existsSync } from "node:fs";
/**
 * A real Postgres for the integration suites, started on demand.
 *
 * Half of this repository's proof lives in `tests/integration/` — every store's
 * guarantees are guarantees *of Postgres* (a unique constraint, a conditional
 * update that either claims a row or does not, a cascade), and there is no
 * mocked database anywhere in `packages/`. So those suites have to run on CI,
 * and CI has no database service: `.github/workflows/ci.yml` is written once
 * and the build session cannot push to it (docs/CI-HANDOVER.md).
 *
 * The answer is to bring the server up from the test runner instead of from the
 * workflow. Every GitHub-hosted `ubuntu-latest` image ships a PostgreSQL server
 * under `/usr/lib/postgresql/<major>/bin`, stopped; this starts a throwaway
 * cluster from those binaries on a high port, in a temp directory, with trust
 * auth and no listener beyond loopback.
 *
 * One cluster is shared by every package: turbo runs `test:unit` once per
 * package and initialising a cluster each time would dominate the run. Sharing
 * is safe because `@auteur/test-db` gives each suite its own *database* on the
 * server, which is the isolation the suites actually need.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 55432;
const USER = "auteur";
const BASE = join(tmpdir(), "auteur-test-postgres");
const DATA = join(BASE, "data");
const LOCK = join(BASE, "starting.lock");
const URL = `postgres://${USER}@127.0.0.1:${PORT.toString()}/postgres`;

const SEARCH_GLOBS = [
  "/usr/lib/postgresql",
  "/usr/local/pgsql",
  "/opt/homebrew/opt",
];

/** `pg_ctl`'s directory, or undefined when no server is installed. */
export const findPostgresBin = async (): Promise<string | undefined> => {
  const onPath = Bun.which("pg_ctl");
  if (onPath !== null) {
    return onPath.replace(/\/pg_ctl$/, "");
  }
  for (const root of SEARCH_GLOBS) {
    if (!existsSync(root)) continue;
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    // Highest major first, so a machine with 14 and 16 installed gets 16.
    const candidates = entries
      .filter((entry) => /^(postgresql@?)?\d+$/.test(entry))
      .sort(
        (a, b) =>
          Number.parseInt(b.replace(/\D/g, ""), 10) -
          Number.parseInt(a.replace(/\D/g, ""), 10),
      );
    for (const candidate of candidates) {
      const bin = join(root, candidate, "bin");
      if (existsSync(join(bin, "pg_ctl"))) return bin;
    }
  }
  return undefined;
};

const isUp = async (bin: string): Promise<boolean> => {
  const proc = Bun.spawn(
    [join(bin, "pg_isready"), "-h", "127.0.0.1", "-p", PORT.toString()],
    {
      stderr: "ignore",
      stdout: "ignore",
    },
  );
  return (await proc.exited) === 0;
};

/**
 * Postgres refuses to run as root, which is exactly what a container build
 * runs as. Under root the commands are re-issued as the `postgres` account,
 * which every distribution's server package creates.
 */
const asServerUser = (bin: string, command: string[]): string[] => {
  if (process.getuid?.() !== 0)
    return [join(bin, command[0] ?? ""), ...command.slice(1)];
  const quoted = [join(bin, command[0] ?? ""), ...command.slice(1)]
    .map((part) => `'${part.replaceAll("'", "'\\''")}'`)
    .join(" ");
  return ["su", "postgres", "-s", "/bin/sh", "-c", quoted];
};

const run = async (bin: string, command: string[]): Promise<number> => {
  const proc = Bun.spawn(asServerUser(bin, command), {
    stderr:
      Bun.env["AUTEUR_TEST_POSTGRES_DEBUG"] === undefined ? "pipe" : "inherit",
    stdout:
      Bun.env["AUTEUR_TEST_POSTGRES_DEBUG"] === undefined ? "pipe" : "inherit",
  });
  return proc.exited;
};

/**
 * Take the initialisation lock, or wait for whoever holds it to finish.
 *
 * turbo runs many packages at once and only one may initialise the cluster.
 * `mkdir` without `recursive` is the atomic test-and-set — which needs the
 * parent to exist, or every attempt fails with ENOENT rather than EEXIST and
 * the loop waits a minute for a lock nobody holds.
 */
const acquireLock = async (bin: string): Promise<"held" | "ready" | "gone"> => {
  await mkdir(BASE, { recursive: true });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await mkdir(LOCK, { recursive: false });
      return "held";
    } catch {
      if (await isUp(bin)) return "ready";
      await Bun.sleep(500);
    }
  }
  return (await isUp(bin)) ? "ready" : "gone";
};

/** Initialise and start the cluster. Returns false if either step failed. */
const createCluster = async (bin: string): Promise<boolean> => {
  await rm(DATA, { force: true, recursive: true });
  await mkdir(DATA, { recursive: true });
  if (process.getuid?.() === 0) {
    await Bun.spawn(["chown", "-R", "postgres:postgres", BASE]).exited;
  }
  const initialized = await run(bin, [
    "initdb",
    "-D",
    DATA,
    "-U",
    USER,
    "--auth=trust",
  ]);
  if (initialized !== 0) return false;

  // The socket lives in the cluster's own directory rather than the
  // distribution's /var/run/postgresql, which a container may not have and
  // where a system cluster would collide with this one.
  const started = await run(bin, [
    "pg_ctl",
    "-D",
    DATA,
    "-l",
    join(BASE, "server.log"),
    "-o",
    `-p ${PORT.toString()} -h 127.0.0.1 -k ${BASE}`,
    "-w",
    "start",
  ]);
  return started === 0;
};

/**
 * Start the shared cluster, or return the URL of one already running.
 *
 * `undefined` means no server is installed — the caller decides whether that is
 * a skip or a failure, and on CI it is a failure.
 */
export const ensureTestPostgres = async (): Promise<string | undefined> => {
  const configured = Bun.env["AUTEUR_TEST_DATABASE_URL"];
  if (configured !== undefined && configured !== "") return configured;

  const bin = await findPostgresBin();
  if (bin === undefined) return undefined;
  if (await isUp(bin)) return URL;

  const lock = await acquireLock(bin);
  if (lock === "ready") return URL;
  if (lock === "gone") return undefined;

  try {
    if (await isUp(bin)) return URL;
    if (!(await createCluster(bin))) return undefined;
    await writeFile(join(BASE, "url"), URL);
    return URL;
  } finally {
    await rm(LOCK, { force: true, recursive: true });
  }
};

if (import.meta.main) {
  const url = await ensureTestPostgres();
  if (url === undefined) {
    process.stderr.write("No PostgreSQL server found on this machine.\n");
    process.exit(1);
  }
  process.stdout.write(`${url}\n`);
}
