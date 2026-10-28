# Historical release intent fixtures

The files in `history/` preserve the pre-0.1.0 workspace Changesets, including the deliberately invalid demo patch. They are historical fixture data, not pending Changesets and not a request to publish or bump any package.

`bun run release:demo` creates an isolated temporary Git clone, adds the demo intent to that clone's `.changeset/` directory, updates its release config and commits the simulated inputs. It exercises patch, minor and major outcomes without changing this repository's active release queue. A normal release still requires every active `.changeset/*.md` to be enumerated in its release config.
