---
description: "Add or update a method in both hdb and hdbext packages while preserving cross-package API parity, tests, and type declarations."
name: "Add Parity Method"
argument-hint: "Method name + expected behavior (and whether it applies to both packages)"
agent: "agent"
---
Implement the requested method change with parity across `hdb/` and `hdbext/` unless explicitly told otherwise.

## Requirements

- Update runtime implementation in both packages (`index.js` and `index.cjs`) when applicable.
- Preserve existing naming and Promise wrapper conventions.
- Add or update tests using existing Mocha + `assert` style.
- Regenerate declaration output (`@types/`) for affected packages.
- Keep changes minimal and avoid unrelated refactors.

## Validation Checklist

- Confirm API parity decisions and call out any intentional divergence.
- Run package-level tests and type generation where feasible.
- Summarize file changes by package and note any env-related test limitations.
