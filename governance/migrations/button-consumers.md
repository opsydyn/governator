# Consumer impact

The verified local type fixture is governance/consumer.tsx; the Storybook dogfood app is a known repository consumer with component tests. The gate recompiles the fixture against the exact tarball declarations and reruns local mapped tests. External usage is unknown: there is no registry/consumer dependency graph or adoption integration. This report does not claim all consumers are migrated.
