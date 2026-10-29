/* Non-publishing integration fixture. The transport must be a confined loopback test registry. */
/* oxlint-disable linteffect/no-naked-object-state-update, linteffect/no-return-in-arrow, linteffect/no-if-statement, linteffect/no-string-sentinel-const, linteffect/no-throw-in-effect */
import { ensure } from "@governator/core";
import { rehearseSingleMaintainer } from "../packages/cli/src/single-maintainer-adapter.ts";
import type { RegistryPort } from "../packages/cli/src/single-maintainer-adapter.ts";
import type { Archive } from "../packages/cli/src/first-release-rehearsal.ts";
import { loadArchives, readRegular } from "./rehearse-single-maintainer.ts";
import { readNpmVersion } from "./npm-transport.ts";
import { join } from "node:path";
import { runDurableRelease } from "./durable-release.ts";
import { withJournalLock } from "./release-journal.ts";

export async function exerciseSealedCoordinator(
  candidate: unknown,
  digest: string,
  commit: string,
  archives: Archive[],
  port: RegistryPort,
) {
  let sends = 0;
  const interruptedPort: RegistryPort = {
    read: (name, version) => port.read(name, version),
    async send(name, version, bytes) {
      await port.send(name, version, bytes);
      sends++;
      if (sends === 2) throw new Error("Simulated lost acknowledgement after fixture upload");
    },
  };
  const interrupted = await rehearseSingleMaintainer(
    candidate,
    digest,
    commit,
    archives,
    interruptedPort,
  );
  ensure(
    interrupted.status === "stopped" &&
      interrupted.packages.map((p) => p.status).join(",") === "verified,unknown,not_attempted",
    "Interrupted fixture did not stop safely",
  );
  const retry = await rehearseSingleMaintainer(candidate, digest, commit, archives, port);
  ensure(
    retry.status === "complete" &&
      retry.packages.map((p) => p.status).join(",") ===
        "already_verified,already_verified,verified",
    "Fixture retry did not verify readback",
  );
  let conflictSends = 0;
  const conflictPort: RegistryPort = {
    async read(name, version) {
      const response = await port.read(name, version);
      if (name === archives[2]!.name && response.status === "present")
        return { status: "present", bytes: Uint8Array.from([0]) };
      return response;
    },
    async send() {
      conflictSends++;
    },
  };
  const conflict = await rehearseSingleMaintainer(
    candidate,
    digest,
    commit,
    archives,
    conflictPort,
  );
  ensure(
    conflict.status === "stopped" &&
      conflict.packages[2]?.status === "conflict" &&
      conflictSends === 0,
    "Injected conflict was not blocked",
  );
  return { interrupted, retry, conflict };
}

export async function exerciseDurablePhase(
  candidate: unknown,
  digest: string,
  commit: string,
  archives: Archive[],
  port: RegistryPort,
  journalDirectory: string,
  artifactId: string,
  phase: "interrupt" | "resume",
  interrupt: () => never,
) {
  let sends = 0;
  const guarded: RegistryPort = {
    read: (name, version) => port.read(name, version),
    async send(name, version, bytes) {
      await port.send(name, version, bytes);
      sends++;
      if (phase === "interrupt" && sends === 2) interrupt();
    },
  };
  return withJournalLock(journalDirectory, (store) =>
    runDurableRelease(
      { candidate, digest, sourceCommit: commit, artifactId },
      archives,
      store,
      guarded,
    ),
  );
}

if (import.meta.main) {
  const [directory, digest, commit, portNumber, phase, journalDirectory, artifactId] =
    process.argv.slice(2);
  ensure(
    Boolean(directory && digest && commit && portNumber && /^[0-9]{1,5}$/.test(portNumber)),
    "Invalid fixture arguments",
  );
  const registry = new URL(`http://127.0.0.1:${portNumber}/`);
  const candidate = JSON.parse(
    new TextDecoder().decode(await readRegular(join(directory!, "candidate.json"))),
  );
  const archives = await loadArchives(directory!);
  const port: RegistryPort = {
    read: (name, version) => readNpmVersion(registry, name, version),
    async send(name, version, bytes) {
      const response = await fetch(new URL("__sealed_send__", registry), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(120000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          version,
          sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
        }),
      });
      ensure(response.ok, "Sealed fixture send failed");
    },
  };
  if (phase !== undefined) {
    ensure(
      (phase === "interrupt" || phase === "resume") && Boolean(journalDirectory && artifactId),
      "Invalid durable fixture arguments",
    );
    const result = await exerciseDurablePhase(
      candidate,
      digest!,
      commit!,
      archives,
      port,
      journalDirectory!,
      artifactId!,
      phase as "interrupt" | "resume",
      () => {
        process.kill(process.pid, "SIGKILL");
        throw new Error("Unable to interrupt fixture process");
      },
    );
    console.log(JSON.stringify(result));
    process.exit(result.status === "complete" ? 0 : 1);
  }
  const result = await exerciseSealedCoordinator(candidate, digest!, commit!, archives, port);
  console.log(
    JSON.stringify({ mode: "sealed-coordinator-fixture", publishable: false, ...result }),
  );
}
