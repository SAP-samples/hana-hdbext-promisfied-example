# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo with **no root `package.json`**. It contains two independent packages:

- `hdb/` — promise wrapper around the `hdb` npm module (`sap-hdb-promisfied`, Node `^20 || ^22 || ^24`)
- `hdbext/` — promise wrapper around `@sap/hdbext` (`sap-hdbext-promisfied`, Node `>=18.18.0`)

All `npm` commands must be run from inside the relevant package directory (`hdb/` or `hdbext/`), never from the repo root.

## Commands

Run from inside `hdb/` or `hdbext/`:

```sh
npm test              # Mocha integration tests in tests/*.Test.js (parallel, 5s timeout)
npm run types         # Regenerate TypeScript declarations into @types/
npm start             # Run the manual example script (test.js / test.cjs)
```

Tests are integration-style and require a reachable SAP HANA instance. Connection config is loaded from `default-env.json` (or `default-env-admin.json`) via `dotenv` + `@sap/xsenv`. When HANA is unavailable, integration test suites auto-skip; static/unit tests still run.

## Architecture

Each package exposes a single default-export ES6 class (`dbClass`) with:

- **Instance methods** that wrap the underlying HANA client callbacks as promises, all named with a `*Promisified` suffix:
  - `preparePromisified(query)` 
  - `statementExecPromisified(statement, parameters)`
  - `statementExecBatchPromisified(statement, parameters)`
  - `loadProcedurePromisified(hdbext, schema, procedure)`
  - `callProcedurePromisified(storedProc, inputParams)`
  - `execSQL(sql)` — convenience method combining prepare + exec

- **Static helpers**:
  - `createConnectionFromEnv(envFile)` — loads connection from env files; respects `TARGET_CONTAINER` env var
  - `createConnection(options)` — direct connection with explicit options
  - `resolveEnv(options)` — returns path to `default-env.json` or `default-env-admin.json`
  - `schemaCalc(options, db)` — resolves `**CURRENT_SCHEMA**` / `*` wildcards
  - `objectName(name)` — expands `*` / null to `%` for SQL LIKE patterns

Each package ships two entry points that must remain behaviorally identical:
- `index.js` — ESM (native `import`)
- `index.cjs` — CJS (`require`)

Type declarations live in `@types/` and are generated via `npm run types` (TypeScript `tsc` with `--emitDeclarationOnly` against JSDoc-annotated JS source).

## Code Style

- Source files use `// @ts-check` with JSDoc type annotations — no TypeScript source files.
- Maintain API parity between `hdb/` and `hdbext/` packages unless a dependency-specific difference is required.
- Maintain parity between `index.js` (ESM) and `index.cjs` (CJS) within each package.
- After any runtime API change, regenerate `@types/` with `npm run types` and verify the output.
- Tests use Mocha + Node `assert` (`describe`/`it`, `assert.equal`, `assert.rejects`).
- Debug logging uses the `debug` package with namespace `hdb-promisified` (hdb) or `hdbext-promisified` (hdbext).

## Environment

- `default-env.json` and `default-env-admin.json` are git-ignored; they hold HANA connection credentials.
- Set `TARGET_CONTAINER` env var to select a specific service binding by name instead of tag.
- Both packages enable connection pooling (`pooling: true`) automatically.
