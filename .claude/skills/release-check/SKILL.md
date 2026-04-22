---
name: release-check
description: Pre-release verification checklist for hdb, hdbext, and/or hdbhelper packages. Run before publishing to npm or tagging a Go release.
disable-model-invocation: true
---

## Scope

- Current state: !`git status --short`
- Last tag: !`git describe --tags --abbrev=0 2>/dev/null || echo "no tags"`

Run pre-release checklist for: $ARGUMENTS (default: all packages)

This repo has no root `package.json`. Run Node.js package commands inside `hdb/` and/or `hdbext/`. Go commands run inside `hdbhelper/`.

## Checklist

### 1. Version and package metadata
- Confirm `version` and `exports` fields are intentional in `package.json`
- Ensure `engines.node` constraints are still valid for the intended release

### 2. Runtime/API parity
- Verify ESM/CJS entry points are aligned in each affected package (`index.js` vs `index.cjs`)
- Confirm cross-package parity between `hdb` and `hdbext`, or document intentional divergence
- Check that `loadProcedurePromisified` and `callProcedurePromisified` maintain their expected signature differences

### 3. Type declaration sync
- Run `npm run types` in each affected package
- Verify generated files under `@types/` reflect current runtime API
- Confirm both `.d.ts` and `.d.cts` declarations are present

### 4. Tests
- Run `npm test` in each affected package
- Summarize failures with file-level impact
- If HANA connectivity is unavailable, report the blocker and confirm static/unit tests still pass

### 5. Docs and examples
- Check README snippets for user-visible API changes
- Ensure method names and signatures in docs match runtime exports

### 6. Release sanity
- Confirm `default-env*.json` and `.env` files are not staged
- Check `npm-shrinkwrap.json` is present and up to date

### 7. Go package (hdbhelper/)
- Run `go build ./...` and `go vet ./...` in `hdbhelper/`
- Run `go test -v ./...` (integration tests auto-skip without HANA)
- Verify `go.mod` module path (`github.com/SAP-samples/hana-hdbext-promisfied-example/hdbhelper`) and Go version directive
- Confirm tag format must be `hdbhelper/vX.Y.Z` (subdirectory prefix required for Go sub-modules)
- Check `hdbhelper/README.md` reflects current API surface

## Output

Provide a concise release readiness summary:
- Scope executed
- Commands run and results by package
- Any parity/type/doc mismatches
- Final recommendation: **ready** / **blocked** / **ready with caveats**
