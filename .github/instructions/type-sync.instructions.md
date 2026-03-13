---
description: "Use when editing public runtime API in hdb/hdbext entry points. Ensures ESM/CJS/type declaration parity and avoids export drift."
name: "Runtime API and Type Sync"
applyTo: "hdb/index.js, hdb/index.cjs, hdbext/index.js, hdbext/index.cjs"
---
# Runtime API and Type Declaration Sync

When changing public methods or signatures in `index.js` / `index.cjs`:

- Keep ESM and CJS entries behaviorally aligned within the same package.
- Mirror equivalent behavior between `hdb/` and `hdbext/` unless dependency-specific behavior requires divergence.
- Preserve existing naming patterns (for example: `*Promisified`, `createConnectionFromEnv`, `resolveEnv`, `schemaCalc`, `objectName`).

## Required Follow-up

- Regenerate declarations with `npm run types` in the affected package.
- Verify generated files under `@types/` reflect the updated API.
- If exports surface changes, ensure package `exports` compatibility is preserved.

## Safety Checks

- Do not introduce breaking export-map behavior casually.
- Keep public signatures stable unless explicitly requested.
- Update README snippets when API changes are user-visible.
