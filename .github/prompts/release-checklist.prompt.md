---
description: "Run a pre-release checklist for this monorepo, covering hdb, hdbext, and hdbhelper tests, type declaration sync, docs parity, and packaging sanity checks."
name: "Release Checklist"
argument-hint: "Optional release scope (hdb, hdbext, hdbhelper, or all) and target version"
agent: "agent"
---
Prepare and execute a pre-release verification checklist for this repository.

## Scope Rules

- This repo has no root `package.json`; run Node.js package commands inside `hdb/` and/or `hdbext/`.
- Go commands run inside `hdbhelper/`.
- Default scope is all packages unless the user explicitly limits scope.

## Checklist

1. **Version and package metadata**
   - Confirm version and `exports` fields are intentional in `package.json`.
   - Ensure `engines.node` constraints are still valid for the intended release.

2. **Runtime/API parity**
   - Verify ESM/CJS entry points are aligned in each affected package (`index.js`, `index.cjs`).
   - Confirm cross-package parity between `hdb` and `hdbext`, or document intentional divergence.

3. **Types sync**
   - Run `npm run types` in each affected package.
   - Verify generated files under `@types/` reflect current runtime API.

4. **Tests**
   - Run `npm test` in each affected Node.js package.
   - Run `go test -v ./...` in `hdbhelper/` (also `go build ./...` and `go vet ./...`).
   - Summarize failures with file-level impact.
   - If HANA connectivity is unavailable, report the blocker and complete static validation.

5. **Docs and examples**
   - Check README snippets for user-visible API changes.
   - Ensure method names and signatures in docs match runtime exports.

6. **Release sanity checks**
   - Confirm ignored local env files are not staged (`.env`, `default-env*.json`).
   - For Go releases: confirm `go.mod` module path and Go version directive are correct.
   - For Go releases: the tag format must be `hdbhelper/vX.Y.Z` (subdirectory prefix required).
   - Provide a concise release readiness summary: ready / blocked / ready with caveats.

## Output Format

Return:
- Scope executed
- Commands run and results by package
- Any parity/type/doc mismatches
- Final release recommendation with blockers and follow-ups
