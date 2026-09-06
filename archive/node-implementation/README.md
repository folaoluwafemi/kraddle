# Archived Node Implementation

The original Kraddle implementation in Node.js. It served as the
executable specification for the Rust port (Phase R) and passed the
differential cross-implementation proof in both directions at commit
`06ddf63`.

Kept as reference. Not maintained, not shipped.

- `src/` — kernel, extractor, evaluators, MCP server, CLI
- `test/` — the 101-test conformance suite (the port source of truth)
- `package.json` — as it was at archive time

The live implementation is `../../rust/`. The Rust differential tests
(`rust/tests/differential.rs`) still execute this archive via `node`
to keep proving cross-implementation compatibility of the on-disk
format. Do not delete this folder while those tests exist.
