# SAP HANA Helper for Python (hdbhelper-py)

[![REUSE status](https://api.reuse.software/badge/github.com/SAP-samples/hana-hdbext-promisfied-example)](https://api.reuse.software/info/github.com/SAP-samples/hana-hdbext-promisfied-example)

## Description

With the standard [hdbcli](https://pypi.org/project/hdbcli/) driver, connecting to SAP HANA from environment credentials and calling stored procedures requires substantial boilerplate:

```python
# Parse VCAP_SERVICES or default-env.json manually...
import json, os
data = json.loads(os.environ["VCAP_SERVICES"])
creds = data["hana"][0]["credentials"]
host, port, user, password = creds["host"], creds["port"], creds["user"], creds["password"]

from hdbcli import dbapi
conn = dbapi.connect(address=host, port=port, user=user, password=password,
                     encrypt=True, sslValidateCertificate=True)
cursor = conn.cursor()
cursor.execute("SET SCHEMA MY_SCHEMA")

# Call a stored procedure with table output
cursor.callproc('MY_SCHEMA."MY_PROC"', [])
columns = [col[0] for col in cursor.description]
rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
cursor.close()
conn.close()
```

With `hdbhelper`, the same code becomes:

```python
from hdbhelper import open_from_env

with open_from_env() as db:
    # Simple query
    rows = db.exec_sql("SELECT SESSION_USER, CURRENT_SCHEMA FROM DUMMY")
    print(rows)

    # Stored procedure — automatic parameter binding and result mapping
    proc = db.load_procedure("MY_SCHEMA", "MY_PROC")
    result = proc.call()
    print(result.output_scalar)
    print(result.result_sets)
```

## Installation

```shell
pip install -e .           # development install
pip install -e ".[dev]"    # with test dependencies (pytest, pytest-asyncio)
```

> **Note:** `hdbcli` is SAP's proprietary Python HANA driver, available on [PyPI](https://pypi.org/project/hdbcli/). Some enterprise environments use internal mirrors — consult your team's Python package index configuration if the standard PyPI install fails.

## Usage

### Creating a connection

Load credentials from `VCAP_SERVICES` environment variable or `default-env.json`:

```python
from hdbhelper import open_from_env

db = open_from_env()
# ... use db ...
db.close()
```

Or use as a context manager for automatic cleanup:

```python
with open_from_env() as db:
    rows = db.exec_sql("SELECT CURRENT_USER FROM DUMMY")
```

From a specific env file:

```python
from hdbhelper import open_from_env_file

with open_from_env_file("/path/to/default-env.json") as db:
    ...
```

With explicit configuration:

```python
from hdbhelper import open, ConnectionConfig

with open(ConnectionConfig(
    host="my-hana.hanacloud.ondemand.com",
    port=443,
    user="DBADMIN",
    password="secret",
    schema="MY_SCHEMA",
    encrypt=True,
)) as db:
    ...
```

Override the target container or schema:

```python
db = open_from_env(target_container="my-hdi-container", schema="CUSTOM_SCHEMA")
```

### Querying

```python
# Execute SQL and get results as list[dict[str, Any]]
rows = db.exec_sql("SELECT SESSION_USER, CURRENT_SCHEMA FROM DUMMY")

# Parameterised query
rows = db.exec_sql("SELECT * FROM MY_TABLE WHERE ID = ?", (42,))

# Schema helpers
schema = db.current_schema()
db.set_schema("NEW_SCHEMA")

# Resolve schema wildcards
schema = db.schema_calc("**CURRENT_SCHEMA**")  # → actual schema name
schema = db.schema_calc("*")                    # → "%"
```

### Stored procedures

```python
# Load procedure metadata
proc = db.load_procedure("MY_SCHEMA", "MY_PROC")

# Call with input parameters — results as Python dicts
result = proc.call("input_value_1", 42)
print(result.output_scalar)   # dict[str, Any] — scalar OUT parameters
print(result.result_sets)     # list[list[dict[str, Any]]] — table OUT parameters
```

Inspect procedure parameters before calling:

```python
for p in proc.params:
    print(p.name, p.parameter_type, p.data_type)
```

### Async usage

`async_hdbhelper` wraps the sync API using `asyncio.to_thread`, making it safe to use from async code without blocking the event loop:

```python
import asyncio
from async_hdbhelper import async_open_from_env

async def main():
    async with await async_open_from_env() as db:
        rows = await db.exec_sql("SELECT SESSION_USER FROM DUMMY")
        print(rows)

        proc = await db.load_procedure("MY_SCHEMA", "MY_PROC")
        result = await proc.call("input_value")
        print(result.output_scalar)

asyncio.run(main())
```

## API Reference

### Connection functions

| Function | Description |
| --- | --- |
| `open(cfg)` | Open connection with explicit `ConnectionConfig` |
| `open_from_env(target_container?, schema?)` | Open from `VCAP_SERVICES` env var or `default-env.json` |
| `open_from_env_file(path, target_container?, schema?)` | Open from a specific env file |
| `resolve_env_path(admin?)` | Path to `default-env.json` or `default-env-admin.json` |
| `object_name(name)` | Expand `None` / `""` / `"*"` → `"%"`; otherwise append `"%"` |

### DB methods

| Method | Description |
| --- | --- |
| `exec_sql(query, params?)` | Execute SQL, return `list[dict[str, Any]]` |
| `ping()` | Verify the connection is alive; returns `bool` |
| `set_schema(schema)` | Set the active schema on the connection |
| `current_schema()` | Get the current connection schema |
| `schema_calc(schema)` | Resolve `**CURRENT_SCHEMA**` / `*` wildcards |
| `load_procedure(schema, name)` | Load stored procedure metadata; returns `Procedure` |
| `close()` | Close the database connection |

`DB` also supports the context manager protocol (`with open_from_env() as db:`).

### Procedure

| Attribute / Method | Description |
| --- | --- |
| `call(*input_params)` | Call procedure; returns `ProcedureResult` |
| `.params` | `list[ProcParam]` — procedure parameter metadata |

`ProcedureResult` has two fields: `output_scalar: dict[str, Any]` for scalar OUT parameters and `result_sets: list[list[dict[str, Any]]]` for table OUT parameters.

### Async (async_hdbhelper)

| Symbol | Description |
| --- | --- |
| `AsyncDB` | Async wrapper around `DB`; thread-safe via `asyncio.to_thread` |
| `AsyncProcedure` | Async wrapper around `Procedure` |
| `async_open(cfg)` | Async version of `open` |
| `async_open_from_env(target_container?, schema?)` | Async version of `open_from_env` |
| `async_open_from_env_file(path, target_container?, schema?)` | Async version of `open_from_env_file` |

`AsyncDB` mirrors all `DB` methods as coroutines and supports `async with`.

## Environment Configuration

Connection credentials are loaded from `default-env.json` (same format as the Node.js and Go packages):

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
        "schema": "...",
        "encrypt": true
      }
    }]
  }
}
```

- Use `default-env-admin.json` for admin connections (`resolve_env_path(admin=True)`).
- Set the `TARGET_CONTAINER` environment variable to select a specific service binding by name rather than by tag.
- TLS is enabled automatically when `encrypt: true` is present in the credentials.

## Requirements

- Python 3.12 or higher
- [hdbcli](https://pypi.org/project/hdbcli/) — SAP HANA Python client driver
- SAP HANA Cloud or on-premise HANA instance

## Known Issues

None

## How to obtain support

This project is provided "as-is": there is no guarantee that raised issues will be answered or addressed in future releases.

## License

Copyright (c) 2026 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE](../LICENSES/Apache-2.0.txt) file.
