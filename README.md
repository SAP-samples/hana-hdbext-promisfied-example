# SAP HANA Client Helpers — Node.js, Go & Python

[![REUSE status](https://api.reuse.software/badge/github.com/SAP-samples/hana-hdbext-promisfied-example)](https://api.reuse.software/info/github.com/SAP-samples/hana-hdbext-promisfied-example)

## Description

This repository contains high-level wrappers for SAP HANA client libraries, simplifying connection management, query execution, and stored procedure invocation in Node.js, Go, and Python:

| Package | Language | Wraps | Runtime |
| --- | --- | --- | --- |
| [`hdb/`](hdb/README.md) | Node.js | `hdb` | `^20 \|\| ^22 \|\| ^24` |
| [`hdbext/`](hdbext/README.md) | Node.js | `@sap/hdbext` | `>=18.18.0` |
| [`hdbhelper/`](hdbhelper/README.md) | Go | `SAP/go-hdb` | Go 1.22+ |
| [`hdbhelper-py/`](hdbhelper-py/README.md) | Python | `hdbcli` | Python 3.12+ |

The Node.js packages expose an ES6 class API (`dbClass`) with dual ESM/CJS entry points (`index.js` / `index.cjs`). The Go package provides an equivalent API surface using idiomatic Go patterns. The Python package wraps `hdbcli` with the same connection-from-environment and stored procedure patterns.

## Motivation

With the standard `@sap/hdbext` you use nested callbacks like this:

```JavaScript
let client = req.db;
client.prepare(
 `SELECT SESSION_USER, CURRENT_SCHEMA FROM "DUMMY"`,
 (err, statement) => {
  if (err) return res.status(500).send(`ERROR: ${err.toString()}`);
  statement.exec([], (err, results) => {
   if (err) return res.status(500).send(`ERROR: ${err.toString()}`);
   return res.status(200).json({ Objects: results });
  });
 });
```

With `sap-hdbext-promisfied` the same code becomes:

```JavaScript
try {
 const dbClass = require("sap-hdbext-promisfied")
 let db = new dbClass(req.db);
 const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA FROM "DUMMY"`)
 const results = await db.statementExecPromisified(statement, [])
 return res.status(200).json({ Objects: results })
} catch (e) {
 return res.status(500).send(`ERROR: ${e.toString()}`)
}
```

## Installation

```shell
# hdbext variant
npm install sap-hdbext-promisfied

# hdb variant (no @sap/hana-client dependency)
npm install sap-hdb-promisfied
```

Both packages are published to the default npm registry (`https://registry.npmjs.org`).

> **Note:** If you previously configured a custom `@sap:registry`, remove it:
>
> ```shell
> npm config delete @sap:registry
> ```

## Usage

### Creating a connection

Pass an existing HANA client instance directly:

```JavaScript
import dbClass from 'sap-hdbext-promisfied'
const db = new dbClass(req.db)           // req.db from Express middleware
```

Or let the class create and manage the connection from environment configuration:

```JavaScript
import dbClass from 'sap-hdbext-promisfied'
const db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
```

For `sap-hdb-promisfied`, call `db.destroyClient()` when done to close the connection:

```JavaScript
import dbClass from 'sap-hdb-promisfied'
const db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
try {
    const results = await db.execSQL(`SELECT CURRENT_USER FROM DUMMY`)
    console.table(results)
} finally {
    db.destroyClient()
}
```

### Querying

```JavaScript
// Convenience: prepare + exec in one call
const results = await db.execSQL(`SELECT SESSION_USER, CURRENT_SCHEMA FROM "DUMMY"`)

// Or step by step for parameterised queries
const statement = await db.preparePromisified(`SELECT * FROM "MY_TABLE" WHERE ID = ?`)
const results = await db.statementExecPromisified(statement, [42])

// Batch execution
await db.statementExecBatchPromisified(statement, [[1], [2], [3]])
```

### Stored procedures

**`hdbext` package** — uses `hdbext.loadProcedure`:

```JavaScript
import * as hdbext from '@sap/hdbext'
const sp = await db.loadProcedurePromisified(hdbext, 'SYS', 'IS_VALID_PASSWORD')
const { outputScalar, results } = await db.callProcedurePromisified(sp, { PASSWORD: 'MyPass1234' })
```

**`hdb` package** — resolves procedure metadata via SQL, no `hdbext` dependency:

```JavaScript
const sp = await db.loadProcedurePromisified('SYS', 'IS_VALID_PASSWORD')
const { outputScalar, results } = await db.callProcedurePromisified(sp, [])
```

**Procedure output shape:**

- Single result set → `{ outputScalar, results }`
- Multiple result sets → `{ outputScalar, results0, results1, ... }`

## API Reference

### Instance methods

| Method | Description |
| --- | --- |
| `preparePromisified(query)` | Prepare a SQL statement; returns a statement object |
| `statementExecPromisified(statement, params)` | Execute a prepared statement |
| `statementExecBatchPromisified(statement, params)` | Execute a prepared statement in batch |
| `loadProcedurePromisified(...)` | Load a stored procedure (signature differs by package — see above) |
| `callProcedurePromisified(storedProc, inputParams)` | Call a loaded stored procedure |
| `execSQL(sql)` | Prepare + execute a statement and return the result set |
| `destroyClient()` | *(hdb only)* Close the underlying connection |
| `validateClient()` | *(hdb only)* Returns `true` if the connection is open and healthy |

### Static helpers

| Method | Description |
| --- | --- |
| `createConnectionFromEnv(envFile)` | Load connection config from env files and open a connection |
| `createConnection(options)` | Open a connection with explicit options |
| `resolveEnv(options)` | Resolve path to `default-env.json`; pass `{ admin: true }` for `default-env-admin.json` |
| `schemaCalc(options, db)` | Resolve schema: `**CURRENT_SCHEMA**` → live value, `*` → `%` |
| `objectName(name)` | Expand `*` / `null` / `undefined` → `%`; otherwise append `%` |
| `fetchSPMetadata(db, procInfo)` | *(hdb only)* Fetch stored procedure parameter metadata from `SYS.PROCEDURE_PARAMETERS` |

## Environment Configuration

Connection credentials are never stored in code. Create a `default-env.json` file in the working directory (git-ignored):

```json
{
  "VCAP_SERVICES": {
    "hana": [{
      "name": "my-hana-service",
      "tags": ["hana"],
      "credentials": {
        "host": "...",
        "port": 443,
        "user": "...",
        "password": "...",
        "encrypt": true
      }
    }]
  }
}
```

- Use `default-env-admin.json` for admin-level connections (pass `{ admin: true }` to `resolveEnv`).
- Set `TARGET_CONTAINER` environment variable to select a specific service binding by name rather than by tag.
- The `hdb` package automatically enables TLS (`useTLS: true`) when `encrypt: true` is present in the credentials.

## CI / CD

### Continuous Integration

Every push to `main` and every pull request runs four parallel jobs via GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

| Job | What it checks | Matrix |
| --- | --- | --- |
| **test-hdb** | `npm install` → `npm test` → `npm run types` | Node.js 20, 22 |
| **test-hdbext** | `npm install` → `npm test` → `npm run types` | Node.js 20, 22 |
| **test-hdbhelper** | `go build` → `go vet` → `go test -v` | Go 1.25 |
| **test-hdbhelper-py** | `pip install` → `pytest -v` | Python 3.12, 3.13 |

All test suites include integration tests that require a live SAP HANA instance. When HANA is unreachable (as in CI), these tests **auto-skip** — the suite still passes. Unit tests always run.

### Releasing the Go module

Go modules are distributed directly from the Git repository — there is no registry to publish to. The Go module proxy (`proxy.golang.org`) caches modules automatically when users run `go get`.

To release a new version of `hdbhelper`:

1. Go to **Actions → Release Go Module → Run workflow**
2. Enter a semver version (e.g. `0.1.0`)
3. The workflow validates, builds, tests, then creates a `hdbhelper/v0.1.0` tag and pushes it

The subdirectory prefix on the tag (`hdbhelper/v...`) is required by Go for modules that live in a subdirectory of a repository. After the tag is pushed, anyone can install the module:

```shell
go get github.com/SAP-samples/hana-hdbext-promisfied-example/hdbhelper@v0.1.0
```

### Releasing the Node.js packages

The Node.js packages (`sap-hdb-promisfied`, `sap-hdbext-promisfied`) are published manually to the npm registry. Before publishing, run the release checklist (`.github/prompts/release-checklist.prompt.md`) which covers version metadata, ESM/CJS parity, type declarations, tests, and documentation.

### Releasing the Python package

The Python package (`sap-hdbhelper-py`) is published to [PyPI](https://pypi.org/project/sap-hdbhelper-py/) via GitHub Actions using trusted publishers (OIDC — no API token needed).

To release a new version of `hdbhelper-py`:

1. Go to **Actions → Release Python Package → Run workflow**
2. Enter a semver version (e.g. `0.1.0`)
3. The workflow validates, tests, bumps the version in `pyproject.toml`, builds, tags `hdbhelper-py/v0.1.0`, and publishes to PyPI

After publishing, anyone can install the package:

```shell
pip install sap-hdbhelper-py
```

## Known Issues

None

## How to obtain support

This project is provided "as-is": there is no guarantee that raised issues will be answered or addressed in future releases.

## License

Copyright (c) 2026 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE](LICENSES/Apache-2.0.txt) file.
