---
name: release-check
description: Pre-release verification checklist for hdb and/or hdbext packages. Run before publishing to npm.
disable-model-invocation: true
---

## Scope

- Current state: !`git status --short`
- Last tag: !`git describe --tags --abbrev=0 2>/dev/null || echo "no tags"`

Run pre-release checklist for: $ARGUMENTS (default: both packages)

This repo has no root `package.json`. Run all package commands inside `hdb/` and/or `hdbext/`.

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

## Output

Provide a concise release readiness summary:
- Scope executed
- Commands run and results by package
- Any parity/type/doc mismatches
- Final recommendation: **ready** / **blocked** / **ready with caveats**
