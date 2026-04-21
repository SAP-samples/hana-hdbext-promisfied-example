---
name: parity-sync
description: Add or update a method across hdb/hdbext packages with ESM/CJS/type parity. Use when changing runtime API in either package.
disable-model-invocation: true
---

Implement the requested method change with parity across `hdb/` and `hdbext/` unless explicitly told otherwise.

$ARGUMENTS

## Steps

1. **Identify scope** — Map the impacted API surface and corresponding files in both packages.
2. **Update runtime implementation** — Edit both `index.js` and `index.cjs` in each affected package. Preserve existing naming conventions (`*Promisified` suffix for promise wrappers).
3. **Respect known divergences** — `loadProcedurePromisified` has different signatures (hdb: 2 params, hdbext: 3 params). `callProcedurePromisified` calls `storedProc.exec()` in hdb but `storedProc()` in hdbext. `destroyClient`/`validateClient`/`fetchSPMetadata` are hdb-only.
4. **Add or update tests** — Use existing Mocha + `assert` style in `tests/*.Test.js`. Tests exercise both ESM and CJS variants via the `moduleVariants` loop pattern.
5. **Regenerate type declarations** — Run `npm run types` in each affected package directory. Verify generated files under `@types/` reflect the updated API.
6. **Keep changes minimal** — Avoid unrelated refactors.

## Output

Report:
- Files changed by package
- Parity status (full parity or justified divergence with explanation)
- Validation performed (tests/types) and any environment blockers
