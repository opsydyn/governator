import { describe, expect, test } from "vitest";
import { digest } from "@governanator/core";
import { evaluateSyntheticReview } from "../packages/versioning/src/synthetic-review.ts";
import { syntheticReviewFixture } from "./m3-synthetic-fixtures.ts";

type Fixture = ReturnType<typeof syntheticReviewFixture>;
function evaluate(mutate: (f: Fixture) => void = () => {}) {
  const fixture = syntheticReviewFixture();
  mutate(fixture);
  const result = evaluateSyntheticReview(fixture);
  expect(result.assurance).toBe("simulated");
  expect(Object.keys(result).sort()).toEqual(["assurance", "reasons", "schemaVersion", "status"]);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  return result;
}
function updatePolicy(f: Fixture) {
  f.scope.authorizationPolicyDigest = digest(f.policy);
  f.bindings[0]!.scope.authorizationPolicyDigest = f.scope.authorizationPolicyDigest;
}

describe("synthetic exact-artifact review", () => {
  test("matching fixtures produce only a deterministic simulated observation", () => {
    expect(evaluate()).toEqual({
      schemaVersion: 1,
      assurance: "simulated",
      status: "matched",
      reasons: [],
    });
    expect(evaluate()).toEqual(evaluate());
  });
  test("unchanged distributed content needs no review and never returns matched", () => {
    expect(
      evaluate((f) => {
        f.scope.distributedChange = false;
        f.provider.reviews = [];
        f.bindings = [];
      }).status,
    ).toBe("not_required");
  });
  const scopeChanges: Record<string, unknown> = {
    repository: { provider: "github", host: "github.com", id: 102 },
    pullRequest: 18,
    commit: "b".repeat(40),
    package: "@other/ui",
    packageVersion: "3.0.0",
    baselineDigest: `sha256:${"5".repeat(64)}`,
    candidateDigest: `sha256:${"6".repeat(64)}`,
    inputDigest: `sha256:${"7".repeat(64)}`,
    releasePolicyId: "release-v2",
    releasePolicyDigest: `sha256:${"8".repeat(64)}`,
    authorizationPolicyId: "owners-v2",
    authorizationPolicyDigest: `sha256:${"9".repeat(64)}`,
    candidateCreatedAt: "2026-10-27T10:00:00.001Z",
    distributedChange: false,
    major: false,
  };
  for (const [field, value] of Object.entries(scopeChanges))
    test(`binding cannot substitute scope ${field}`, () => {
      expect(evaluate((f) => Object.assign(f.bindings[0]!.scope, { [field]: value })).status).toBe(
        "insufficient_evidence",
      );
    });
  const invalidEvidence: Record<string, (f: Fixture) => void> = {
    "wrong provider repository": (f) => {
      f.provider.repository.id++;
    },
    "wrong provider host": (f) => {
      f.provider.repository.host = "other.example";
    },
    "wrong policy repository": (f) => {
      f.policy.repository.id++;
      updatePolicy(f);
    },
    "wrong policy host": (f) => {
      f.policy.repository.host = "other.example";
      updatePolicy(f);
    },
    "wrong binding host": (f) => {
      f.bindings[0]!.scope.repository.host = "other.example";
    },
    "wrong PR": (f) => {
      f.provider.pullRequest++;
    },
    "changed head": (f) => {
      f.provider.head = "b".repeat(40);
    },
    "review on old commit": (f) => {
      f.provider.reviews[0]!.commit = "b".repeat(40);
    },
    "missing reviews": (f) => {
      f.provider.reviews = [];
    },
    "missing binding": (f) => {
      f.bindings = [];
    },
    "swapped review": (f) => {
      f.bindings[0]!.reviewId++;
    },
    "swapped actor": (f) => {
      f.bindings[0]!.actorId++;
    },
    "unauthorized actor": (f) => {
      f.policy.assignments = [];
      updatePolicy(f);
    },
    "revoked actor": (f) => {
      f.policy.assignments[0]!.status = "revoked";
      updatePolicy(f);
    },
    "unknown membership": (f) => {
      f.policy.assignments[0]!.status = "unknown";
      updatePolicy(f);
    },
    "missing owner": (f) => {
      f.policy.assignments[0]!.roles = ["api-owner"];
      updatePolicy(f);
    },
    "missing major API owner": (f) => {
      f.policy.assignments[0]!.roles = ["design-system-owner"];
      updatePolicy(f);
    },
    "tampered policy": (f) => {
      f.policy.assignments[0]!.roles = [];
    },
    "wrong policy id": (f) => {
      f.policy.id = "different";
      updatePolicy(f);
    },
    "partial membership": (f) => {
      f.policy.completeness = "partial";
      updatePolicy(f);
    },
    "unknown membership completeness": (f) => {
      f.policy.completeness = "unknown";
      updatePolicy(f);
    },
    "partial pages": (f) => {
      f.provider.completeness = "partial";
    },
    "unknown pages": (f) => {
      f.provider.completeness = "unknown";
    },
    "provider unavailable": (f) => {
      f.provider.availability = "unavailable";
    },
    "provider unknown": (f) => {
      f.provider.availability = "unknown";
    },
    "unsupported history": (f) => {
      f.provider.history = "unknown";
    },
    "changes requested": (f) => {
      f.provider.reviews[0]!.state = "changes_requested";
    },
    dismissal: (f) => {
      f.provider.reviews[0]!.state = "dismissed";
    },
    "comment only": (f) => {
      f.provider.reviews[0]!.state = "commented";
    },
    pending: (f) => {
      f.provider.reviews[0]!.state = "pending";
    },
    "unknown state": (f) => {
      f.provider.reviews[0]!.state = "unknown";
    },
    superseded: (f) => {
      f.provider.reviews[0]!.effective = "superseded";
    },
    "unknown effective state": (f) => {
      f.provider.reviews[0]!.effective = "unknown";
    },
    "duplicate review": (f) => {
      f.provider.reviews.push({ ...f.provider.reviews[0]! });
    },
    "conflicting review id": (f) => {
      f.provider.reviews.push({ ...f.provider.reviews[0]!, state: "changes_requested" });
    },
    "ambiguous current actor": (f) => {
      f.provider.reviews.push({ ...f.provider.reviews[0]!, id: 302 });
    },
    "duplicate actor assignment": (f) => {
      f.policy.assignments.push({ ...f.policy.assignments[0]! });
      updatePolicy(f);
    },
    "duplicate binding": (f) => {
      f.bindings.push({ ...f.bindings[0]! });
    },
    "provider predates review": (f) => {
      f.provider.observedAt = "2026-10-27T10:59:59.999Z";
    },
    "old candidate": (f) => {
      f.scope.candidateCreatedAt = "2026-10-26T11:59:59.999Z";
      f.bindings[0]!.scope.candidateCreatedAt = f.scope.candidateCreatedAt;
    },
    "future candidate": (f) => {
      f.scope.candidateCreatedAt = "2026-10-27T12:00:00.001Z";
    },
  };
  for (const [name, mutate] of Object.entries(invalidEvidence))
    test(`fails closed: ${name}`, () => {
      expect(evaluate(mutate).status).toBe("insufficient_evidence");
      expect(evaluate(mutate).reasons.length).toBeGreaterThan(0);
    });
  for (const source of ["policy", "provider", "review", "binding"] as const) {
    for (const [boundary, time] of Object.entries({
      future: "2026-10-27T12:00:00.001Z",
      stale: "2026-10-26T11:59:59.999Z",
    })) {
      test(`${source} rejects ${boundary} observation`, () => {
        expect(
          evaluate((f) => {
            if (source === "review") f.provider.reviews[0]!.submittedAt = time;
            else if (source === "binding") f.bindings[0]!.observedAt = time;
            else f[source].observedAt = time;
            if (source === "policy") updatePolicy(f);
          }).status,
        ).toBe("insufficient_evidence");
      });
    }
    for (const expiry of [
      "2026-10-27T12:00:00.000Z",
      "2026-10-27T08:00:00.000Z",
      "2026-10-29T12:00:00.000Z",
    ]) {
      test(`${source} rejects expired, inverted or overlong interval ${expiry}`, () => {
        expect(
          evaluate((f) => {
            if (source === "review") f.provider.reviews[0]!.expiresAt = expiry;
            else if (source === "binding") f.bindings[0]!.expiresAt = expiry;
            else f[source].expiresAt = expiry;
            if (source === "policy") updatePolicy(f);
          }).status,
        ).toBe("insufficient_evidence");
      });
    }
  }
  for (const source of ["review", "binding"] as const)
    test(`${source} must not predate candidate by even 1ms`, () => {
      expect(
        evaluate((f) => {
          if (source === "review") f.provider.reviews[0]!.submittedAt = "2026-10-27T09:59:59.999Z";
          else f.bindings[0]!.observedAt = "2026-10-27T09:59:59.999Z";
        }).status,
      ).toBe("insufficient_evidence");
    });
  test("policy may predate candidate; binding observation is independent of review", () => {
    expect(
      evaluate((f) => {
        f.bindings[0]!.observedAt = f.scope.candidateCreatedAt;
        f.bindings[0]!.expiresAt = "2026-10-28T10:00:00.000Z";
      }).status,
    ).toBe("matched");
  });
  test("candidate and clock equality are valid, expiry is exclusive, 24 hours inclusive", () => {
    expect(
      evaluate((f) => {
        f.scope.candidateCreatedAt = f.at;
        f.bindings[0]!.scope.candidateCreatedAt = f.at;
        f.provider.observedAt = f.at;
        f.provider.reviews[0]!.submittedAt = f.at;
        f.provider.reviews[0]!.expiresAt = "2026-10-28T12:00:00.000Z";
        f.bindings[0]!.observedAt = f.at;
        f.bindings[0]!.expiresAt = "2026-10-28T12:00:00.000Z";
      }).status,
    ).toBe("matched");
  });
  test("candidate age of exactly 24 hours remains valid with fresh independent evidence", () => {
    expect(
      evaluate((f) => {
        f.scope.candidateCreatedAt = "2026-10-26T12:00:00.000Z";
        f.bindings[0]!.scope.candidateCreatedAt = f.scope.candidateCreatedAt;
      }).status,
    ).toBe("matched");
  });
  test("every observation remains valid one millisecond before expiry", () => {
    expect(
      evaluate((f) => {
        f.policy.expiresAt = "2026-10-27T12:00:00.001Z";
        f.provider.expiresAt = "2026-10-27T12:00:00.001Z";
        f.provider.reviews[0]!.expiresAt = "2026-10-27T12:00:00.001Z";
        f.bindings[0]!.expiresAt = "2026-10-27T12:00:00.001Z";
        updatePolicy(f);
      }).status,
    ).toBe("matched");
  });
  for (const source of ["policy", "provider", "review", "binding"] as const) {
    test(`${source} rejects an interval of 24 hours plus one millisecond`, () => {
      expect(
        evaluate((f) => {
          if (source === "review") f.provider.reviews[0]!.expiresAt = "2026-10-28T11:00:00.001Z";
          else if (source === "binding") f.bindings[0]!.expiresAt = "2026-10-28T11:15:00.001Z";
          else if (source === "provider") f.provider.expiresAt = "2026-10-28T11:30:00.001Z";
          else {
            f.policy.expiresAt = "2026-10-28T09:00:00.001Z";
            updatePolicy(f);
          }
        }).status,
      ).toBe("insufficient_evidence");
    });
  }
  test("nonmajor distributed change only requires owner", () => {
    expect(
      evaluate((f) => {
        f.scope.major = false;
        f.bindings[0]!.scope.major = false;
        f.policy.assignments[0]!.roles = ["design-system-owner"];
        updatePolicy(f);
      }).status,
    ).toBe("matched");
  });
  test("separate authorized reviewers may cover required roles", () => {
    expect(
      evaluate((f) => {
        f.policy.assignments[0]!.roles = ["design-system-owner"];
        f.policy.assignments.push({ actorId: 202, status: "active", roles: ["api-owner"] });
        updatePolicy(f);
        f.provider.reviews.push({ ...f.provider.reviews[0]!, id: 302, actorId: 202 });
        f.bindings.push({ ...f.bindings[0]!, reviewId: 302, actorId: 202 });
      }).status,
    ).toBe("matched");
  });
  test("a current changes request blocks other approvals even by unauthorized actors", () => {
    expect(
      evaluate((f) =>
        f.provider.reviews.push({
          ...f.provider.reviews[0]!,
          id: 302,
          actorId: 999,
          state: "changes_requested",
        }),
      ).status,
    ).toBe("insufficient_evidence");
  });
  test("explicitly superseded changes request does not override current approval", () => {
    expect(
      evaluate((f) =>
        f.provider.reviews.push({
          ...f.provider.reviews[0]!,
          id: 302,
          state: "changes_requested",
          effective: "superseded",
        }),
      ).status,
    ).toBe("matched");
  });
  test("changing expected candidate rejects saved bindings", () => {
    expect(
      evaluate((f) => {
        f.scope.candidateDigest = `sha256:${"0".repeat(64)}`;
      }).status,
    ).toBe("insufficient_evidence");
  });
});

describe("strict synthetic input validation", () => {
  const locations = (f: Fixture): object[] => [
    f,
    f.scope,
    f.scope.repository,
    f.policy,
    f.policy.repository,
    f.policy.assignments[0]!,
    f.provider,
    f.provider.repository,
    f.provider.reviews[0]!,
    f.bindings[0]!,
    f.bindings[0]!.scope,
    f.bindings[0]!.scope.repository,
  ];
  for (let index = 0; index < 12; index++)
    test(`unknown trust/role fields rejected at nesting ${index}`, () => {
      const f = syntheticReviewFixture();
      Object.assign(locations(f)[index]!, { verified: true });
      expect(() => evaluateSyntheticReview(f)).toThrow();
    });
  for (const value of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])
    test(`rejects invalid numeric identities ${value}`, () => {
      for (const change of [
        (f: Fixture) => {
          f.scope.repository.id = value;
        },
        (f: Fixture) => {
          f.scope.pullRequest = value;
        },
        (f: Fixture) => {
          f.provider.reviews[0]!.id = value;
        },
        (f: Fixture) => {
          f.provider.reviews[0]!.actorId = value;
        },
        (f: Fixture) => {
          f.policy.assignments[0]!.actorId = value;
        },
        (f: Fixture) => {
          f.bindings[0]!.reviewId = value;
        },
        (f: Fixture) => {
          f.bindings[0]!.actorId = value;
        },
      ]) {
        const f = syntheticReviewFixture();
        change(f);
        expect(() => evaluateSyntheticReview(f)).toThrow();
      }
    });
  const timestampChanges = [
    (f: Fixture, t: string) => {
      f.at = t;
    },
    (f: Fixture, t: string) => {
      f.scope.candidateCreatedAt = t;
    },
    (f: Fixture, t: string) => {
      f.policy.observedAt = t;
    },
    (f: Fixture, t: string) => {
      f.policy.expiresAt = t;
    },
    (f: Fixture, t: string) => {
      f.provider.observedAt = t;
    },
    (f: Fixture, t: string) => {
      f.provider.expiresAt = t;
    },
    (f: Fixture, t: string) => {
      f.provider.reviews[0]!.submittedAt = t;
    },
    (f: Fixture, t: string) => {
      f.provider.reviews[0]!.expiresAt = t;
    },
    (f: Fixture, t: string) => {
      f.bindings[0]!.observedAt = t;
    },
    (f: Fixture, t: string) => {
      f.bindings[0]!.expiresAt = t;
    },
    (f: Fixture, t: string) => {
      f.bindings[0]!.scope.candidateCreatedAt = t;
    },
  ];
  for (const value of [
    "2026-02-30T12:00:00.000Z",
    "2026-10-27T12:00:00Z",
    "2026-10-27T12:00:00.000+00:00",
  ])
    test(`rejects malformed calendar/canonical timestamp ${value} everywhere`, () => {
      for (const change of timestampChanges) {
        const f = syntheticReviewFixture();
        change(f, value);
        expect(() => evaluateSyntheticReview(f)).toThrow();
      }
    });
  test("rejects oversized strings and collections", () => {
    const f = syntheticReviewFixture();
    f.scope.package = "x".repeat(257);
    expect(() => evaluateSyntheticReview(f)).toThrow();
    for (const field of ["reviews", "assignments", "bindings"] as const) {
      const g = syntheticReviewFixture();
      if (field === "reviews")
        g.provider.reviews = Array.from({ length: 1001 }, () => g.provider.reviews[0]!);
      else if (field === "assignments")
        g.policy.assignments = Array.from({ length: 1001 }, () => g.policy.assignments[0]!);
      else g.bindings = Array.from({ length: 1001 }, () => g.bindings[0]!);
      expect(() => evaluateSyntheticReview(g)).toThrow();
    }
  });
});
