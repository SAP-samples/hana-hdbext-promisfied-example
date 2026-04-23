# Project Guidelines

## Architecture
- This repository contains two independent Node.js packages and one Go package:
  - `hdb/`: promise wrapper around `hdb`
  - `hdbext/`: promise wrapper around `@sap/hdbext`
  - `hdbhelper/`: Go helper wrapping `SAP/go-hdb`
- There is no root `package.json`; run package commands inside `hdb/` or `hdbext/`.
- Go commands run inside `hdbhelper/`.
- Keep API parity inside each package across:
  - ESM entry: `index.js`
  - CJS entry: `index.cjs`
  - Type declarations: `@types/*.d.ts` and `@types/*.d.cts`

## Code Style
- Source is JavaScript with `// @ts-check` and JSDoc typing, not TypeScript source files.
- Preserve existing naming patterns:
  - Promise wrappers use `*Promisified` suffix.
  - Static helpers include `createConnectionFromEnv`, `createConnection`, `resolveEnv`, `schemaCalc`, `objectName`.
- Prefer small, explicit Promise-based flows and preserve current public method signatures.

## Build and Test
- In each package (`hdb/` and `hdbext/`):
  - `npm test` runs Mocha tests in `tests/*.Test.js` with `--parallel --timeout 5000`.
  - `npm run types` regenerates declaration output into `@types/`.
  - `npm start` runs `node test` (manual example script).
- If you change runtime API in `index.js` or `index.cjs`, update type declarations in `@types/` and run `npm run types`.

## Dependency Updates

Run `bash scripts/update-deps.sh` from the repo root to update all dependencies across all packages. The script handles npm, Go, and pip ecosystems, regenerates TypeScript declarations, runs tests, and outputs a JSON report. See `CLAUDE.md` for full details.

## Environment and Pitfalls
- Tests are integration-style and expect a reachable HANA setup.
- Connection config is loaded from environment/default env files via `dotenv` + `@sap/xsenv` (`default-env.json` / `default-env-admin.json`).
- `TARGET_CONTAINER` may affect service resolution; avoid hardcoding service names.
- `.env` and `default-*.json` are intentionally ignored in git.
- Respect package engine constraints:
  - `hdb`: Node `^20 || ^22 || ^24`
  - `hdbext`: Node `>=18.18.0`

## Conventions
- Keep behavior aligned between `hdb` and `hdbext` unless a dependency-specific difference is required.
- Preserve existing debug namespaces:
  - `hdb-promisified`
  - `hdbext-promisified`
- For tests, follow existing Mocha + `assert` style (`describe`/`it`, `assert.equal`, `assert.rejects`).
- Do not introduce breaking export changes in package `exports` maps without updating both package README and type outputs.
