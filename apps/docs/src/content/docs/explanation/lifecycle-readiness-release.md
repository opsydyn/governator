---
title: Lifecycle, readiness and release are separate
description: Understand the three independent decisions displayed beside a component.
---

Lifecycle describes the registry's intended place for a component: draft, candidate, stable, deprecated or retired. It is a maintained declaration with policy-defined allowed transitions. A stable label does not prove fresh evidence.

Readiness answers whether the selected target policy is satisfied by the available evidence at an evaluation time. The dogfood stable policy checks actual local unit tests from Vitest within 24 hours. It does not claim that behavior, visuals, keyboard focus, accessibility or design review have been accepted for production.

Release eligibility answers a different question: whether the exact packed artifact, compatibility, version intent, consumers, documents and review evidence meet the release policy. A clean test result does not establish that a release is compatible or authorized.

Button makes the distinction concrete. Its lifecycle is stable. Local mapped tests can satisfy the limited readiness policy. Removing `tone` breaks the baseline contract, so the proposed contract `1.2.1` and shared package `8.4.2` patches remain blocked. A minor still fails the known major requirement. Even choosing major versions does not supply trusted review.

Storybook displays these facts independently; sidebar L/G markers mean lifecycle and readiness gate. A question mark means identity/report is unavailable, never approval. The addon presents the producer's report without rerunning evaluation.

Publication, deployment and adoption are further facts requiring their own trusted observations. The governance packages remain `0.1.0` and unpublished; the demo UI's candidate `8.4.2` is an analyzed example version. The publisher is disabled. No local eligible/demo result establishes an external release. Follow the [tutorial](/tutorials/local-dogfood/) to inspect this distinction and [exact candidate explanation](/explanation/changesets-and-exact-candidates/) for release semantics.
