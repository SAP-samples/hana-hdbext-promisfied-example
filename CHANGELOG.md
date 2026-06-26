# Changelog

All notable dependency updates to this project are documented in this file.

## 2026-06-26

### Security

Resolved 3 `npm audit` findings in `hdb/` and `hdbext/`. All were dev-only transitives pulled in by `mocha` — production consumers of `sap-hdb-promisfied` and `sap-hdbext-promisfied` were never exposed. Fixed by pinning via the `overrides` field in each `package.json`.

- **high** — `serialize-javascript` <=7.0.4 RCE via `RegExp.flags` ([GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq)) — overridden to `^7.0.5` (resolved to 7.0.6)
- **low** — `diff` 6.0.0-8.0.2 DoS in `parsePatch`/`applyPatch` ([GHSA-73rr-hh4g-fpgx](https://github.com/advisories/GHSA-73rr-hh4g-fpgx)) — overridden to `^8.0.3` (resolved to 8.0.4)
- **moderate** — `mocha` (flagged solely because of the two transitives above) — cleared by the overrides

Post-fix `npm audit` reports `found 0 vulnerabilities` in both packages.

### Dependencies Updated

#### hdb/
- `@types/node` 25.9.3 -> 25.9.4

#### hdbext/
- `@types/node` 25.9.3 -> 25.9.4

### Test Results
- hdb: passed (20 passing, 8s)
- hdbext: passed (20 passing, 11s)
- hdbhelper: no version change; build + vet passed; `go test` blocked locally by Windows ("Access is denied" on test binary — AV/SmartScreen, not a code regression). CI runs cleanly on Linux.
- hdbhelper-py: skipped (no active virtual environment)

## 2026-06-12

### Dependencies Updated

#### hdb/
- `@sap/xsenv` 6.2.0 -> 6.2.1
- `@types/node` 25.6.0 -> 25.9.3

#### hdbext/
- `@sap/xsenv` 6.2.0 -> 6.2.1
- `@types/node` 25.6.0 -> 25.9.3

#### hdbhelper/
- `github.com/SAP/go-hdb` v1.16.6 -> v1.16.12
- `golang.org/x/text` (indirect) v0.36.0 -> v0.38.0

### Test Results
- hdb: passed (20 passing, 7s)
- hdbext: passed (20 passing, 11s)
- hdbhelper: build + vet passed; `go test` blocked locally by Windows ("Access is denied" on test binary — AV/SmartScreen, not a code regression). CI runs cleanly on Linux.
- hdbhelper-py: skipped (no active virtual environment)
