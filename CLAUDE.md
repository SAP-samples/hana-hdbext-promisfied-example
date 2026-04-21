# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo with **no root `package.json`**. It contains three independent packages:

- `hdb/` — Node.js promise wrapper around the `hdb` npm module (`sap-hdb-promisfied`, Node `^20 || ^22 || ^24`)
- `hdbext/` — Node.js promise wrapper around `@sap/hdbext` (`sap-hdbext-promisfied`, Node `>=18.18.0`)
- `hdbhelper/` — Go helper package wrapping `SAP/go-hdb` (Go 1.22+)

Node.js `npm` commands must be run from inside `hdb/` or `hdbext/`. Go commands must be run from inside `hdbhelper/`.

## Commands

### Node.js (run from inside `hdb/` or `hdbext/`)

```sh
npm test              # Mocha integration tests in tests/*.Test.js (parallel, 5s timeout)
npm run types         # Regenerate TypeScript declarations into @types/
npm start             # Run the manual example script (test.js / test.cjs)
npm run prodinstall   # Install only production dependencies (for packaging)
```

There is no lint script. There is no root-level `npm test` or `npm run types`.

### Go (run from inside `hdbhelper/`)

```sh
go test -v ./...      # Run all tests (integration tests auto-skip without HANA)
go build ./...        # Build
go vet ./...          # Static analysis
```

## Architecture

Each package exposes a single default-export ES6 class (`dbClass`) with promise wrappers around callback-based HANA client methods.

### Entry Points (must remain behaviorally identical)

- `index.js` — ESM (native `import`), `"type": "module"` in package.json
- `index.cjs` — CJS (`require`)

The `exports` field in each package.json maps `import` to `index.js` and `require` to `index.cjs`. Do not introduce breaking export-map changes without updating both README and type outputs.

### Type Declarations

- Live in `@types/` — generated via `npm run types` (TypeScript `tsc --declaration --allowJs --emitDeclarationOnly`)
- Generated from JSDoc annotations in the JS source, not from TS source files
- `hdbext/` has a `shims.d.ts` declaring ambient modules for `debug`, `@sap/xsenv`, `@sap/hdbext`
- Output includes both `.d.ts` (ESM) and `.d.cts` (CJS) declarations
- After any runtime API change, regenerate with `npm run types` and verify the output

### Key API Differences Between Packages

Both packages share the same base API surface but differ in these areas:

| Feature | `hdb/` | `hdbext/` |
| --- | --- | --- |
| `loadProcedurePromisified` | `(schema, procedure)` — resolves metadata via SQL against `SYS.PROCEDURE_PARAMETERS` | `(hdbext, schema, procedure)` — delegates to `hdbext.loadProcedure` |
| `callProcedurePromisified` | Calls `storedProc.exec(inputParams, cb)` (prepared statement) | Calls `storedProc(inputParams, cb)` (proxy function from hdbext) |
| `destroyClient()` | Yes — closes underlying hdb connection | No |
| `validateClient()` | Yes — checks `readyState === 'connected'` | No |
| `fetchSPMetadata(db, procInfo)` | Static helper for procedure parameter lookup | No (handled by hdbext internally) |
| Connection setup | `hdb.createClient()` + TLS when `encrypt: true` | `hdbext.createConnection()` + `pooling: true` |
| `setSchema()` | Static helper called during connection | Not needed (hdbext handles it) |

### Tests

Test files: `hdb/tests/hdb.Test.js` and `hdbext/tests/hdbext.Test.js`.

Each test file exercises **both ESM and CJS** variants via a `moduleVariants` loop — the test imports `index.js` and `require`s `index.cjs`, running identical assertions against each. This pattern ensures the two entry points stay aligned.

Tests are organized in three groups:

1. **Static helper methods** — `resolveEnv`, `objectName`, `schemaCalc` — always run (no HANA needed)
2. **Procedure output mapping** — tests `callProcedurePromisified` with fake clients — always run
3. **Integration** — queries HANA; the `before` hook probes connectivity and calls `this.skip()` if unreachable

When HANA is unavailable, groups 1 and 2 still pass. Report this limitation clearly in results.

### Go Package (`hdbhelper/`)

Single Go module wrapping `SAP/go-hdb` with:

- **`env.go`** — `VCAP_SERVICES` parser, `OpenFromEnv`, `OpenFromEnvFile`, `Open`, `ResolveEnvPath`, functional options (`WithTargetContainer`, `WithSchema`)
- **`hdbhelper.go`** — `DB` struct (wraps `*sql.DB`), `ExecSQL`, `SchemaCalc`, `ObjectName`
- **`procedure.go`** — `LoadProcedure`, `Call` (returns `map[string]any`), `CallTyped[T]` (generic struct scanning via `db` tags)

Tests in `hdbhelper_test.go` follow the same auto-skip pattern: `mustConnect(t)` calls `t.Skipf()` when HANA is unreachable. Unit tests for `ObjectName`, `ResolveEnvPath`, `resolveService`, `parsePort`, `parseBool` always run.

## Code Style

- Source files use `// @ts-check` with JSDoc type annotations — no TypeScript source files.
- Maintain API parity between `hdb/` and `hdbext/` packages unless a dependency-specific difference is required (see table above).
- Maintain parity between `index.js` (ESM) and `index.cjs` (CJS) within each package.
- Preserve existing naming patterns: `*Promisified` suffix for promise wrappers, `createConnectionFromEnv`, `createConnection`, `resolveEnv`, `schemaCalc`, `objectName` for static helpers.
- Tests use Mocha + Node `assert` (`describe`/`it`, `assert.equal`, `assert.deepEqual`, `assert.rejects`).
- Debug logging uses the `debug` package with namespace `hdb-promisified` (hdb) or `hdbext-promisified` (hdbext).
- Keep public method signatures stable unless explicitly requested.
- The repo also has `.github/copilot-instructions.md`, `.github/prompts/`, and `.github/agents/` for GitHub Copilot. Keep these aligned with `.claude/` equivalents when updating AI-facing guidance.

## Environment

- `default-env.json` and `default-env-admin.json` are git-ignored; they hold HANA connection credentials.
- Set `TARGET_CONTAINER` env var to select a specific service binding by name instead of tag.
- The `hdbext` package enables connection pooling (`pooling: true`) automatically. The `hdb` package enables TLS (`useTLS: true`) when `encrypt: true` is present.

### default-env.json Structure

```json
{
  "VCAP_SERVICES": {
    "hana": [{
      "name": "hana-service",
      "tags": ["hana"],
      "credentials": {
        "host": "...", "port": 443,
        "user": "...", "password": "...",
        "schema": "...", "encrypt": true
      }
    }]
  }
}
```

## Gotchas

- **`npm-shrinkwrap.json`** — Both packages ship shrinkwrap files, pinning exact dependency versions. Run `npm install` (not `npm ci`) in each package directory. If you update a dependency, the shrinkwrap updates automatically.
- **`@types/` includes test declarations** — `npm run types` generates `@types/tests/*.d.ts` and `@types/test.d.ts` as a side effect of `tsconfig.json` having `rootDir: "."`. These are harmless noise — don't delete them manually; they'll regenerate.
- **No TypeScript compiler installed globally** — `tsc` is resolved via the `typescript` package in `devDependencies`. If `npm run types` fails with "tsc not found", run `npm install` first.
