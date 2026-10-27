import { createHash } from "node:crypto";
import {
  canonicalPublicKey,
  copyBytes,
  decodeBase64,
  pae,
  parseStrictJson,
  verifyEd25519,
} from "./secure.ts";

const TYPES = {
  root: "application/vnd.governanator.fixture-root.v1+json",
  policy: "application/vnd.governanator.fixture-policy.v1+json",
  enrollment: "application/vnd.governanator.fixture-enrollment.v1+json",
  recovery: "application/vnd.governanator.fixture-recovery.v1+json",
} as const;
const LIMIT = 65_536;
const DAY = 86_400_000;
type Obj = Record<string, any>;
export type FixturePolicyStore = {
  version: number;
  epoch: number;
  roots: SignedFixture[];
  rootTimes: string[];
  policy: SignedFixture;
  policyRootVersion: number;
  rotationPolicies: { policy: SignedFixture; policyRootVersion: number }[];
  policyHistory: {
    policy: SignedFixture;
    policyRootVersion: number;
    at: string;
    action: string | null;
    proof: SignedFixture | null;
  }[];
  checkpoint: {
    rootVersion: number;
    rootDigest: string;
    policyRevision: number;
    policyDigest: string;
    lastTime: string;
    repository: FixtureRepository;
    policyId: string;
    epoch: number;
  };
  pendingChallenges: Uint8Array[];
  consumedChallenges: string[];
  recovery: SignedFixture | null;
};
export type FixtureRepository = { provider: "github"; host: "github.com"; id: number };
export type SignedFixture = {
  bytes: Uint8Array;
  signatures: { keyId: string; signature: string }[];
};
export type FixturePolicyResult = {
  schemaVersion: 1;
  assurance: "fixture-only";
  status: "committed" | "insufficient_evidence" | "interrupted";
  reasons: ("invalid_evidence" | "interrupted_before_commit")[];
  store: FixturePolicyStore | null;
};
function check(x: unknown): asserts x {
  if (!x) throw new Error("invalid");
}
function clone(value: unknown, depth = 0, budget = { nodes: 0, bytes: 0 }): any {
  check(depth < 40 && ++budget.nodes <= 10000);
  if (typeof value === "string") {
    budget.bytes += value.length;
    check(budget.bytes <= 2_000_000);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (ArrayBuffer.isView(value)) {
    const b = copyBytes(value, LIMIT);
    budget.bytes += b.length;
    check(budget.bytes <= 2_000_000);
    return b;
  }
  check(typeof value === "object" && value !== null);
  if (Array.isArray(value)) {
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    check(
      Number.isSafeInteger(length) && length <= 100 && Reflect.ownKeys(value).length === length + 1,
    );
    const out = [];
    for (let i = 0; i < length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      check(d && d.enumerable && "value" in d);
      out.push(clone(d.value, depth + 1, budget));
    }
    return out;
  }
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const keys = Reflect.ownKeys(value);
  check(keys.length <= 32);
  const out: Obj = Object.create(null);
  for (const key of keys) {
    check(typeof key === "string" && key !== "__proto__");
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(d && d.enumerable && "value" in d);
    out[key] = clone(d.value, depth + 1, budget);
  }
  return out;
}
function obj(value: unknown, fields: string[]): Obj {
  check(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Uint8Array),
  );
  const v = value as Obj;
  const keys = Object.keys(v);
  check(keys.length === fields.length && fields.every((k) => Object.hasOwn(v, k)));
  return v;
}
function array(value: unknown, min: number, max: number): any[] {
  check(Array.isArray(value) && value.length >= min && value.length <= max);
  return value;
}
function positive(value: unknown): asserts value is number {
  check(typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}
function nonnegative(value: unknown): asserts value is number {
  check(typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}
function text(value: unknown): asserts value is string {
  check(typeof value === "string" && value.length > 0 && value.length <= 256);
}
function hash(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function digest(value: unknown): asserts value is string {
  check(typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value));
}
function nullableDigest(value: unknown): void {
  if (value !== null) digest(value);
}
function timestamp(value: unknown): number {
  check(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value));
  const n = Date.parse(value);
  check(Number.isFinite(n) && new Date(n).toISOString() === value);
  return n;
}
function fresh(v: Obj, at: number): void {
  const a = timestamp(v.issuedAt),
    b = timestamp(v.expiresAt);
  check(a <= at && b > at && b > a && b - a <= DAY);
}
function historical(v: Obj, at: number): void {
  const a = timestamp(v.issuedAt),
    b = timestamp(v.expiresAt);
  check(a <= at && b > a && b - a <= DAY);
}
function repo(value: unknown): Obj {
  const v = obj(value, ["provider", "host", "id"]);
  check(v.provider === "github" && v.host === "github.com");
  positive(v.id);
  return v;
}
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function sameRepo(a: unknown, b: unknown): boolean {
  const x = repo(a),
    y = repo(b);
  return x.id === y.id;
}
function owner(value: unknown): Obj {
  const v = obj(value, ["actorId", "keyId", "publicKey"]);
  positive(v.actorId);
  digest(v.keyId);
  canonicalPublicKey(v.publicKey, v.keyId);
  return v;
}
function owners(values: unknown, min: number, max: number): Obj[] {
  const all = array(values, min, max).map(owner);
  check(
    new Set(all.map((x) => x.actorId)).size === all.length &&
      new Set(all.map((x) => x.keyId)).size === all.length,
  );
  return all;
}
function assignment(value: unknown): Obj {
  const v = obj(value, ["actorId", "keyId", "publicKey", "status", "roles"]);
  owner({ actorId: v.actorId, keyId: v.keyId, publicKey: v.publicKey });
  check(v.status === "active" || v.status === "revoked");
  const roles = array(v.roles, 0, 2);
  check(
    roles.every((x) => x === "design-system-owner" || x === "api-owner") &&
      new Set(roles).size === roles.length,
  );
  return v;
}
function root(payload: unknown, expected: Obj, at: number, current = true): Obj {
  const r = obj(payload, [
    "schemaVersion",
    "repository",
    "policyId",
    "version",
    "previousDigest",
    "currentPolicyDigest",
    "issuedAt",
    "expiresAt",
    "threshold",
    "administrators",
  ]);
  check(
    r.schemaVersion === 1 &&
      sameRepo(r.repository, expected.repository) &&
      r.policyId === expected.policyId,
  );
  positive(r.version);
  nullableDigest(r.previousDigest);
  nullableDigest(r.currentPolicyDigest);
  if (current) fresh(r, at);
  else historical(r, at);
  const o = owners(r.administrators, 2, 32);
  check(Number.isSafeInteger(r.threshold) && r.threshold >= 2 && r.threshold <= o.length);
  return r;
}
function policy(payload: unknown, expected: Obj, at: number, current = true): Obj {
  const p = obj(payload, [
    "schemaVersion",
    "repository",
    "id",
    "revision",
    "previousDigest",
    "issuedAt",
    "expiresAt",
    "assignments",
  ]);
  check(
    p.schemaVersion === 1 &&
      sameRepo(p.repository, expected.repository) &&
      p.id === expected.policyId,
  );
  positive(p.revision);
  nullableDigest(p.previousDigest);
  if (current) fresh(p, at);
  else historical(p, at);
  if (p.revision === 1) check(p.previousDigest === null && p.assignments.length === 0);
  else digest(p.previousDigest);
  const a = array(p.assignments, 0, 100).map(assignment);
  check(
    new Set(a.map((x) => x.actorId)).size === a.length &&
      new Set(a.map((x) => x.keyId)).size === a.length,
  );
  return p;
}
function envelope(value: unknown): SignedFixture {
  const e = obj(value, ["bytes", "signatures"]);
  check(e.bytes instanceof Uint8Array && e.bytes.byteLength <= LIMIT);
  const signatures = array(e.signatures, 1, 32).map((s) => {
    const x = obj(s, ["keyId", "signature"]);
    digest(x.keyId);
    const b = decodeBase64(x.signature, 64);
    check(b.length === 64);
    return { keyId: x.keyId, signature: x.signature };
  });
  check(new Set(signatures.map((s) => s.keyId)).size === signatures.length);
  return { bytes: e.bytes, signatures };
}
function verifySigned(
  e: SignedFixture,
  type: keyof typeof TYPES,
  admins: Obj[],
  threshold: number,
  allowOther = false,
): void {
  let count = 0;
  for (const s of e.signatures) {
    const a = admins.find((x) => x.keyId === s.keyId);
    if (a) {
      check(
        verifyEd25519(
          canonicalPublicKey(a.publicKey, a.keyId),
          pae(TYPES[type], e.bytes),
          decodeBase64(s.signature, 64),
        ),
      );
      count++;
    } else check(allowOther);
  }
  check(count >= threshold);
}
function verifyRootBoth(e: SignedFixture, old: Obj, next: Obj): void {
  for (const a of old.administrators)
    for (const b of next.administrators) if (a.keyId === b.keyId) check(a.actorId === b.actorId);
  const combined = [
    ...old.administrators,
    ...next.administrators.filter(
      (a: Obj) => !old.administrators.some((b: Obj) => a.keyId === b.keyId),
    ),
  ];
  verifySigned(e, "root", combined, Math.max(old.threshold, next.threshold));
  verifySigned(e, "root", old.administrators, old.threshold, true);
  verifySigned(e, "root", next.administrators, next.threshold, true);
}
function payload(e: SignedFixture): unknown {
  return parseStrictJson(e.bytes, LIMIT);
}
function initial(r: Obj, p: Obj): void {
  check(
    r.version === 1 &&
      r.previousDigest === null &&
      r.currentPolicyDigest === null &&
      p.revision === 1 &&
      p.previousDigest === null &&
      p.assignments.length === 0,
  );
}
function pendingLists(store: Obj): void {
  const pending = array(store.pendingChallenges, 0, 100);
  const consumed = array(store.consumedChallenges, 0, 100);
  for (const b of pending) check(b instanceof Uint8Array && b.byteLength <= LIMIT);
  for (const d of consumed) digest(d);
  check(
    new Set(pending.map(hash)).size === pending.length &&
      new Set(consumed).size === consumed.length &&
      pending.every((b) => !consumed.includes(hash(b))),
  );
}
function recoveryAuthority(value: unknown): Obj {
  const a = obj(value, ["owners", "threshold", "minimumEpoch"]);
  const o = owners(a.owners, 2, 32);
  check(Number.isSafeInteger(a.threshold) && a.threshold >= 2 && a.threshold <= o.length);
  nonnegative(a.minimumEpoch);
  return a;
}
function recoveryProof(
  e: SignedFixture,
  authority: unknown,
  witness: unknown,
  expected: Obj,
  at: number,
  historicalProof = false,
): Obj {
  const a = recoveryAuthority(authority);
  verifySigned(e, "recovery", a.owners, a.threshold);
  const p = obj(payload(e), [
    "schemaVersion",
    "purpose",
    "repository",
    "policyId",
    "priorEpoch",
    "nextEpoch",
    "rootDigest",
    "policyDigest",
    "auditId",
    "issuedAt",
    "expiresAt",
  ]);
  check(
    p.schemaVersion === 1 &&
      p.purpose === "fixture-policy-recovery" &&
      sameRepo(p.repository, expected.repository) &&
      p.policyId === expected.policyId,
  );
  nonnegative(p.priorEpoch);
  positive(p.nextEpoch);
  check(p.nextEpoch === p.priorEpoch + 1 && p.priorEpoch >= a.minimumEpoch);
  digest(p.rootDigest);
  digest(p.policyDigest);
  text(p.auditId);
  fresh(p, at);
  const w = obj(witness, ["repository", "policyId", "epoch"]);
  check(
    sameRepo(w.repository, expected.repository) &&
      w.policyId === expected.policyId &&
      w.epoch === (historicalProof ? p.nextEpoch : p.priorEpoch),
  );
  return p;
}
function checkpoint(
  store: Obj,
  r: Obj,
  p: Obj,
  rb: Uint8Array,
  pb: Uint8Array,
  expected: Obj,
  at: number,
): void {
  const c = obj(store.checkpoint, [
    "rootVersion",
    "rootDigest",
    "policyRevision",
    "policyDigest",
    "lastTime",
    "repository",
    "policyId",
    "epoch",
  ]);
  check(
    c.rootVersion === r.version &&
      c.rootDigest === hash(rb) &&
      c.policyRevision === p.revision &&
      c.policyDigest === hash(pb) &&
      c.epoch === store.epoch &&
      c.policyId === expected.policyId &&
      sameRepo(c.repository, expected.repository) &&
      timestamp(c.lastTime) <= at,
  );
}
function validateStore(
  store: Obj,
  expected: Obj,
  anchor: SignedFixture | null,
  authority: unknown,
  witness: unknown,
  at: number,
): { root: Obj; policy: Obj; rootEnvelope: SignedFixture; policyEnvelope: SignedFixture } {
  obj(store, [
    "version",
    "epoch",
    "roots",
    "rootTimes",
    "policy",
    "policyRootVersion",
    "rotationPolicies",
    "policyHistory",
    "checkpoint",
    "pendingChallenges",
    "consumedChallenges",
    "recovery",
  ]);
  positive(store.version);
  nonnegative(store.epoch);
  positive(store.policyRootVersion);
  pendingLists(store);
  const history = array(store.roots, 1, 32).map(envelope);
  const rootTimes = array(store.rootTimes, 1, 32).map(timestamp);
  check(
    rootTimes.length === history.length &&
      rootTimes.every((n, i) => n <= at && (i === 0 || n >= rootTimes[i - 1]!)),
  );
  const rotations = array(store.rotationPolicies, 0, 31).map((x) =>
    obj(x, ["policy", "policyRootVersion"]),
  );
  check(rotations.length === history.length - 1);
  let prev: Obj | undefined;
  let first: Obj | undefined;
  for (const e of history) {
    if (prev) verifySigned(e, "root", prev.administrators, prev.threshold, true);
    const r = root(payload(e), expected, rootTimes[history.indexOf(e)]!);
    if (e === history[history.length - 1]) fresh(r, at);
    if (!prev) {
      first = r;
      check(r.version === 1 && r.previousDigest === null && r.currentPolicyDigest === null);
      if (store.epoch === 0)
        check(
          anchor && eq(Array.from(e.bytes), Array.from(anchor.bytes)) && store.recovery === null,
        );
      else {
        const recovery = envelope(store.recovery);
        const rp = recoveryProof(recovery, authority, witness, expected, rootTimes[0]!, true);
        check(rp.nextEpoch === store.epoch && rp.rootDigest === hash(e.bytes));
      }
      verifySigned(e, "root", r.administrators, r.threshold);
    } else {
      check(
        r.version === prev.version + 1 && r.previousDigest === hash(history[r.version - 2]!.bytes),
      );
      const rotation = rotations[r.version - 2]!;
      positive(rotation.policyRootVersion);
      check(rotation.policyRootVersion < r.version);
      fresh(prev, rootTimes[r.version - 1]!);
      const rotationSigner = root(
        payload(history[rotation.policyRootVersion - 1]!),
        expected,
        rootTimes[r.version - 1]!,
        false,
      );
      const rotationPolicy = envelope(rotation.policy);
      verifySigned(
        rotationPolicy,
        "policy",
        rotationSigner.administrators,
        rotationSigner.threshold,
      );
      policy(payload(rotationPolicy), expected, rootTimes[r.version - 1]!);
      check(r.currentPolicyDigest === hash(rotationPolicy.bytes));
      verifyRootBoth(e, prev, r);
    }
    prev = r;
  }
  check(prev && first && prev.version === history.length);
  const entries = array(store.policyHistory, 1, 100).map((x) =>
    obj(x, ["policy", "policyRootVersion", "at", "action", "proof"]),
  );
  let previousTime = 0;
  let previousPolicy: SignedFixture | undefined;
  let previousSigner = 0;
  let previousPayload: Obj | undefined;
  const replay: Obj = { epoch: store.epoch, pendingChallenges: [], consumedChallenges: [] };
  const rotationRevisions = rotations.map(
    (rotation: Obj) =>
      policy(payload(envelope(rotation.policy)), expected, at, false).revision as number,
  );
  check(
    rotationRevisions.every((n: number, i: number) => i === 0 || n >= rotationRevisions[i - 1]!),
  );
  for (const [index, entry] of entries.entries()) {
    positive(entry.policyRootVersion);
    check(entry.policyRootVersion >= previousSigner && entry.policyRootVersion <= history.length);
    const entryTime = timestamp(entry.at);
    check(
      entryTime >= previousTime &&
        entryTime <= at &&
        entryTime >= rootTimes[entry.policyRootVersion - 1]!,
    );
    previousTime = entryTime;
    const signerRoot = root(payload(history[entry.policyRootVersion - 1]!), expected, entryTime);
    const e = envelope(entry.policy);
    verifySigned(e, "policy", signerRoot.administrators, signerRoot.threshold);
    const p = policy(payload(e), expected, entryTime);
    check(
      p.revision === index + 1 &&
        (index === 0
          ? p.previousDigest === null
          : p.previousDigest === hash(previousPolicy!.bytes)),
    );
    const activeVersion =
      1 + rotationRevisions.filter((revision: number) => revision < p.revision).length;
    check(entry.policyRootVersion === activeVersion);
    if (index === 0) {
      check(entry.action === null && entry.proof === null);
    } else {
      fresh(previousPayload!, entryTime);
      if (entry.proof !== null) replay.pendingChallenges = [envelope(entry.proof).bytes];
      else replay.pendingChallenges = [];
      validateDiff(
        previousPayload!,
        p,
        entry.action,
        entry.proof,
        replay,
        expected,
        entryTime,
        hash(previousPolicy!.bytes),
        hash(e.bytes),
      );
    }
    previousPayload = p;
    previousPolicy = e;
    previousSigner = entry.policyRootVersion;
  }
  for (const rotation of rotations) {
    const e = envelope(rotation.policy);
    check(
      entries.some(
        (entry: Obj) =>
          entry.policyRootVersion === rotation.policyRootVersion &&
          hash(envelope(entry.policy).bytes) === hash(e.bytes) &&
          timestamp(entry.at) <= rootTimes[rotations.indexOf(rotation) + 1]!,
      ),
    );
  }
  check(eq(replay.consumedChallenges, store.consumedChallenges));
  const pe = envelope(store.policy);
  check(
    previousPolicy &&
      hash(previousPolicy.bytes) === hash(pe.bytes) &&
      previousSigner === store.policyRootVersion,
  );
  const signer = history[store.policyRootVersion - 1];
  check(signer);
  const sr = root(payload(signer), expected, at, signer === history[history.length - 1]);
  verifySigned(pe, "policy", sr.administrators, sr.threshold);
  const p = policy(payload(pe), expected, at);
  if (store.epoch > 0) {
    const rp = recoveryProof(
      envelope(store.recovery),
      authority,
      witness,
      expected,
      rootTimes[0]!,
      true,
    );
    check(rp.policyDigest === hash(envelope(entries[0]!.policy).bytes));
  }
  checkpoint(store, prev, p, history[history.length - 1]!.bytes, pe.bytes, expected, at);
  check(timestamp(store.checkpoint.lastTime) >= Math.max(previousTime, ...rootTimes));
  return { root: prev, policy: p, rootEnvelope: history[history.length - 1]!, policyEnvelope: pe };
}
function nextCheckpoint(
  r: Obj,
  p: Obj,
  re: SignedFixture,
  pe: SignedFixture,
  expected: Obj,
  epoch: number,
  at: string,
) {
  return {
    rootVersion: r.version,
    rootDigest: hash(re.bytes),
    policyRevision: p.revision,
    policyDigest: hash(pe.bytes),
    lastTime: at,
    repository: expected.repository,
    policyId: expected.policyId,
    epoch,
  };
}
function validateDiff(
  old: Obj,
  next: Obj,
  action: unknown,
  proofValue: unknown,
  store: Obj,
  expected: Obj,
  at: number,
  prevDigest: string,
  nextDigest: string,
): void {
  check(["enroll", "rotate", "roles", "revoke", "remove"].includes(action as string));
  const before = old.assignments as Obj[],
    after = next.assignments as Obj[];
  const ids = new Set([...before.map((a) => a.actorId), ...after.map((a) => a.actorId)]);
  const changes = [...ids].filter(
    (id) =>
      !eq(
        before.find((x) => x.actorId === id),
        after.find((x) => x.actorId === id),
      ),
  );
  check(changes.length === 1);
  const a = before.find((x) => x.actorId === changes[0]),
    b = after.find((x) => x.actorId === changes[0]);
  if (action === "enroll") check(!a && b && b.status === "active");
  if (action === "remove") check(a && !b);
  if (action === "rotate")
    check(
      a &&
        b &&
        a.status === "active" &&
        b.status === a.status &&
        eq(b.roles, a.roles) &&
        a.keyId !== b.keyId &&
        a.publicKey !== b.publicKey,
    );
  if (action === "roles")
    check(
      a &&
        b &&
        a.status === b.status &&
        a.keyId === b.keyId &&
        a.publicKey === b.publicKey &&
        !eq(a.roles, b.roles),
    );
  if (action === "revoke")
    check(
      a &&
        b &&
        a.status === "active" &&
        b.status === "revoked" &&
        a.keyId === b.keyId &&
        a.publicKey === b.publicKey &&
        eq(a.roles, b.roles),
    );
  if (action === "enroll" || action === "rotate") {
    check(b);
    const proof = envelope(proofValue);
    verifySigned(proof, "enrollment", [b], 1);
    const c = obj(payload(proof), [
      "schemaVersion",
      "purpose",
      "repository",
      "policyId",
      "epoch",
      "revision",
      "previousPolicyDigest",
      "nextPolicyDigest",
      "actorId",
      "keyId",
      "nonce",
      "issuedAt",
      "expiresAt",
    ]);
    check(
      c.schemaVersion === 1 &&
        c.purpose === "fixture-reviewer-enrollment" &&
        sameRepo(c.repository, expected.repository) &&
        c.policyId === expected.policyId &&
        c.epoch === store.epoch &&
        c.revision === next.revision &&
        c.previousPolicyDigest === prevDigest &&
        c.nextPolicyDigest === nextDigest &&
        c.actorId === b.actorId &&
        c.keyId === b.keyId &&
        typeof c.nonce === "string" &&
        /^[0-9a-f]{32}$/.test(c.nonce),
    );
    fresh(c, at);
    const id = hash(proof.bytes);
    check(!store.consumedChallenges.includes(id));
    const index = store.pendingChallenges.findIndex(
      (x: Uint8Array) => hash(x) === id && Buffer.from(x).equals(Buffer.from(proof.bytes)),
    );
    check(index >= 0);
    store.pendingChallenges.splice(index, 1);
    store.consumedChallenges.push(id);
    check(store.consumedChallenges.length <= 100);
  } else check(proofValue === null);
}
export function applyFixturePolicyTransition(input: unknown): FixturePolicyResult {
  let original: FixturePolicyStore | null = null;
  try {
    if (input && typeof input === "object") {
      const d = Object.getOwnPropertyDescriptor(input, "store");
      if (d && "value" in d && d.value !== null) original = clone(d.value);
    }
    const raw = obj(clone(input), [
      "schemaVersion",
      "expected",
      "anchor",
      "recoveryAuthority",
      "epochWitness",
      "storeWitness",
      "store",
      "expectedStoreVersion",
      "at",
      "transition",
      "crashMode",
    ]);
    check(raw.schemaVersion === 1 && ["none", "before", "after"].includes(raw.crashMode));
    const expected = obj(raw.expected, ["repository", "policyId"]);
    repo(expected.repository);
    text(expected.policyId);
    const at = timestamp(raw.at);
    nonnegative(raw.expectedStoreVersion);
    original = raw.store;
    const anchor = raw.anchor === null ? null : envelope(raw.anchor);
    const t = raw.transition;
    check(t && typeof t.kind === "string");
    const store = raw.store === null ? null : clone(raw.store);
    check(
      (store === null
        ? t.kind === "recovery" || raw.expectedStoreVersion === 0
        : store.version === raw.expectedStoreVersion) &&
        raw.expectedStoreVersion < Number.MAX_SAFE_INTEGER,
    );
    const sw = obj(raw.storeWitness, [
      "repository",
      "policyId",
      "epoch",
      "version",
      "rootDigest",
      "policyDigest",
      "lastTime",
      "consumedChallenges",
    ]);
    check(
      sameRepo(sw.repository, expected.repository) &&
        sw.policyId === expected.policyId &&
        sw.version === raw.expectedStoreVersion,
    );
    nonnegative(sw.epoch);
    const consumed = array(sw.consumedChallenges, 0, 100);
    for (const id of consumed) digest(id);
    check(new Set(consumed).size === consumed.length);
    if (sw.version === 0)
      check(
        sw.rootDigest === null &&
          sw.policyDigest === null &&
          sw.lastTime === null &&
          consumed.length === 0,
      );
    else {
      digest(sw.rootDigest);
      digest(sw.policyDigest);
      check(timestamp(sw.lastTime) <= at);
    }
    if (store !== null) {
      check(sw.epoch === store.epoch);
      if (t.kind !== "recovery") {
        const checkpoint = obj(store.checkpoint, [
          "rootVersion",
          "rootDigest",
          "policyRevision",
          "policyDigest",
          "lastTime",
          "repository",
          "policyId",
          "epoch",
        ]);
        check(
          sw.rootDigest === checkpoint.rootDigest &&
            sw.policyDigest === checkpoint.policyDigest &&
            sw.lastTime === checkpoint.lastTime &&
            eq(consumed, store.consumedChallenges),
        );
      }
    }
    let next: Obj;
    if (t.kind === "bootstrap" || t.kind === "recovery") {
      if (t.kind === "bootstrap") {
        obj(t, ["kind", "root", "policy"]);
        check(store === null && raw.expectedStoreVersion === 0 && sw.epoch === 0);
      } else obj(t, ["kind", "root", "policy", "authorization"]);
      const re = envelope(t.root),
        pe = envelope(t.policy);
      let recovery: SignedFixture | null = null;
      let rp: Obj | null = null;
      if (t.kind === "bootstrap")
        check(anchor && Buffer.from(re.bytes).equals(Buffer.from(anchor.bytes)));
      else {
        recovery = envelope(t.authorization);
        rp = recoveryProof(recovery, raw.recoveryAuthority, raw.epochWitness, expected, at);
        check(
          rp.rootDigest === hash(re.bytes) &&
            rp.policyDigest === hash(pe.bytes) &&
            rp.priorEpoch === sw.epoch,
        );
      }
      const r = root(payload(re), expected, at);
      verifySigned(re, "root", r.administrators, r.threshold);
      verifySigned(pe, "policy", r.administrators, r.threshold);
      const p = policy(payload(pe), expected, at);
      initial(r, p);
      let epoch = 0;
      if (t.kind === "bootstrap") {
        const w = obj(raw.epochWitness, ["repository", "policyId", "epoch"]);
        check(
          sameRepo(w.repository, expected.repository) &&
            w.policyId === expected.policyId &&
            w.epoch === 0,
        );
      } else {
        check(rp);
        if (store !== null) {
          nonnegative(store.epoch);
          check(store.epoch === rp.priorEpoch);
        }
        epoch = rp.nextEpoch;
      }
      next = {
        version: raw.expectedStoreVersion + 1,
        epoch,
        roots: [re],
        rootTimes: [raw.at],
        policy: pe,
        policyRootVersion: 1,
        rotationPolicies: [],
        policyHistory: [
          { policy: pe, policyRootVersion: 1, at: raw.at, action: null, proof: null },
        ],
        checkpoint: nextCheckpoint(r, p, re, pe, expected, epoch, raw.at),
        pendingChallenges: [],
        consumedChallenges: [],
        recovery,
      };
    } else {
      check(store !== null);
      const w = obj(raw.epochWitness, ["repository", "policyId", "epoch"]);
      check(
        sameRepo(w.repository, expected.repository) &&
          w.policyId === expected.policyId &&
          w.epoch === store.epoch,
      );
      if (store.epoch === 0) check(anchor);
      const current = validateStore(
        store,
        expected,
        anchor,
        raw.recoveryAuthority,
        raw.epochWitness,
        at,
      );
      if (t.kind === "root") {
        obj(t, ["kind", "root"]);
        const re = envelope(t.root);
        verifySigned(re, "root", current.root.administrators, current.root.threshold, true);
        const r = root(payload(re), expected, at);
        check(
          r.version === current.root.version + 1 &&
            r.previousDigest === hash(current.rootEnvelope.bytes) &&
            r.currentPolicyDigest === hash(current.policyEnvelope.bytes) &&
            store.roots.length < 32,
        );
        verifyRootBoth(re, current.root, r);
        store.roots.push(re);
        store.rootTimes.push(raw.at);
        store.rotationPolicies.push({
          policy: current.policyEnvelope,
          policyRootVersion: store.policyRootVersion,
        });
        store.checkpoint = nextCheckpoint(
          r,
          current.policy,
          re,
          current.policyEnvelope,
          expected,
          store.epoch,
          raw.at,
        );
      } else {
        obj(t, ["kind", "action", "policy", "proof"]);
        check(t.kind === "policy");
        const pe = envelope(t.policy);
        verifySigned(pe, "policy", current.root.administrators, current.root.threshold);
        const p = policy(payload(pe), expected, at);
        check(
          p.revision === current.policy.revision + 1 &&
            p.previousDigest === hash(current.policyEnvelope.bytes),
        );
        validateDiff(
          current.policy,
          p,
          t.action,
          t.proof,
          store,
          expected,
          at,
          hash(current.policyEnvelope.bytes),
          hash(pe.bytes),
        );
        check(store.policyHistory.length < 100);
        store.policy = pe;
        store.policyRootVersion = current.root.version;
        store.policyHistory.push({
          policy: pe,
          policyRootVersion: current.root.version,
          at: raw.at,
          action: t.action,
          proof: t.proof,
        });
        store.checkpoint = nextCheckpoint(
          current.root,
          p,
          current.rootEnvelope,
          pe,
          expected,
          store.epoch,
          raw.at,
        );
      }
      store.version++;
      next = store;
    }
    if (raw.crashMode === "before")
      return {
        schemaVersion: 1,
        assurance: "fixture-only",
        status: "interrupted",
        reasons: ["interrupted_before_commit"],
        store: original,
      };
    return {
      schemaVersion: 1,
      assurance: "fixture-only",
      status: "committed",
      reasons: [],
      store: next as FixturePolicyStore,
    };
  } catch {
    return {
      schemaVersion: 1,
      assurance: "fixture-only",
      status: "insufficient_evidence",
      reasons: ["invalid_evidence"],
      store: original,
    };
  }
}
