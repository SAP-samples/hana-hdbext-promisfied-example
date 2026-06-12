# Changelog

All notable dependency updates to this project are documented in this file.

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
