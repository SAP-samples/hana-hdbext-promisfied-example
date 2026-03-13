---
description: "Use when running, fixing, or updating package scripts, tests, or build/type generation in this monorepo. Covers command scope, package boundaries, and verification flow."
name: "Package Test/Build Command Scope"
applyTo: "hdb/**, hdbext/**"
---
# Package Command Scope and Verification

- This repository has no root `package.json`.
- Run `npm` scripts from inside either `hdb/` or `hdbext/`.
- Never assume a root-level `npm test` or `npm run types` exists.

## Standard Commands

For each package (`hdb/` or `hdbext/`):
- `npm test` → Mocha integration tests (`tests/*.Test.js`, parallel, 5s timeout)
- `npm run types` → regenerate declarations into `@types/`
- `npm start` → run `test.js` sample script

## Verification Rules

- If runtime APIs changed in `index.js` or `index.cjs`, regenerate type declarations with `npm run types` in the same package.
- Prefer validating only the affected package first; run both packages when cross-package parity is changed.
- Keep command output concise and focus on failures, stack traces, and the exact file impacted.

## Environment Caveat

- Tests are integration-style and may require a reachable HANA setup and local env files (`.env`, `default-env*.json`).
- If connectivity is unavailable, report that limitation clearly and still complete static/code-level validation.
