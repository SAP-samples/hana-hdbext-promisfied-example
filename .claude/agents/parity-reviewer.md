---
description: Review cross-package API parity between hdb/, hdbext/, and hdbhelper/ after changes. Use after modifying entry points in any package.
tools: Read, Grep, Glob
model: sonnet
---

Compare the public API surface across all three packages:

1. **Method inventory** — List all public methods/functions in `hdb/index.js`, `hdbext/index.js`, and `hdbhelper/*.go`. Flag any method present in one but not another (excluding known package-specific methods: hdb-only `destroyClient`, `validateClient`, `fetchSPMetadata`, `setSchema`; Go-specific `CallTyped`, `Ping`).

2. **ESM/CJS alignment** (Node.js only) — For each Node.js package, diff `index.js` and `index.cjs` to ensure they export identical APIs with identical behavior.

3. **Type declaration check** (Node.js only) — Verify `@types/index.d.ts` and `@types/index.d.cts` exist in each Node.js package and declare the same methods as the runtime source.

4. **Signature parity** — Confirm shared methods have compatible signatures. Note the known intentional divergences:
   - `loadProcedurePromisified`: hdb takes `(schema, procedure)`, hdbext takes `(hdbext, schema, procedure)`, Go takes `(ctx, schema, name)`
   - `callProcedurePromisified`: hdb calls `storedProc.exec()`, hdbext calls `storedProc()` directly, Go uses `(*Procedure).Call()`
   - Go uses `context.Context` as first parameter (idiomatic Go pattern)

5. **Report** — Output a summary table:
   - Full parity / Justified divergence / Unintentional drift
   - For any drift found, list the specific file and line
