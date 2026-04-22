# hdbhelper-py: Python HANA Client Helper

**Date:** 2026-04-22
**Status:** Approved

## Overview

A Python package wrapping SAP's `hdbcli` driver with the same convenience API surface as the existing `hdbhelper` (Go), `hdb` (Node.js), and `hdbext` (Node.js) packages in this monorepo. Provides environment-based connection resolution, SQL execution, stored procedure loading/calling, and an async layer.

## Decisions

- **Driver:** `hdbcli` (SAP's official Python HANA driver, DB-API 2.0)
- **Structure:** Flat single-module layout (Approach A) — `hdbhelper.py` + `async_hdbhelper.py`
- **Async:** Both sync and async via `asyncio.to_thread()` wrapping
- **Python version:** 3.12+
- **Package name:** `sap-hdbhelper-py` (directory: `hdbhelper-py/`)

## Directory Layout

```
hdbhelper-py/
├── hdbhelper.py            # DB class, env resolution, stored procedures (sync)
├── async_hdbhelper.py      # AsyncDB class wrapping sync via asyncio.to_thread
├── tests/
│   └── test_hdbhelper.py   # pytest with auto-skip pattern
├── pyproject.toml          # PEP 621 metadata, deps, scripts
├── README.md
└── .gitignore
```

## Public API — Sync (`hdbhelper.py`)

### Data Types

```python
@dataclass
class ConnectionConfig:
    host: str
    port: int = 443
    user: str = ""
    password: str = ""
    schema: str = ""
    encrypt: bool = False

@dataclass
class ProcParam:
    name: str
    data_type: str
    parameter_type: str  # IN, OUT, INOUT
    has_default: str     # 'TRUE'/'FALSE' from HANA (kept as string, matching Go)
    is_inplace: str      # 'TRUE'/'FALSE' from HANA (kept as string, matching Go)
    table_type_schema: str
    table_type_name: str
    is_table_type_synonym: str  # 'TRUE'/'FALSE' from synonym join
    object_schema: str          # resolved synonym schema (empty if no synonym)
    object_name: str            # resolved synonym name (empty if no synonym)

@dataclass
class ProcedureResult:
    output_scalar: dict[str, Any]
    result_sets: list[list[dict[str, Any]]]
```

### Module-level Functions

| Function | Signature | Description |
|---|---|---|
| `open` | `(cfg: ConnectionConfig) -> DB` | Connect with explicit config |
| `open_from_env` | `(target_container=None, schema=None) -> DB` | Connect from VCAP_SERVICES env/file |
| `open_from_env_file` | `(path: str, target_container=None, schema=None) -> DB` | Connect from specific JSON file |
| `resolve_env_path` | `(admin: bool = False) -> str` | Return path to default-env.json |
| `object_name` | `(name: str \| None) -> str` | Expand wildcards for SQL LIKE (`None`, `""`, `"*"` → `"%"`, else `name + "%"`) |

### DB Class

| Method | Returns | Description |
|---|---|---|
| `exec_sql(query, params=None)` | `list[dict[str, Any]]` | Execute SQL, return rows as dicts. Optional params for parameterized queries. |
| `ping()` | `bool` | Check connection health (returns True if alive) |
| `set_schema(schema)` | `None` | Execute SET SCHEMA (identifier quoted: `"` → `""`) |
| `current_schema()` | `str` | Query current schema |
| `schema_calc(schema)` | `str` | Resolve schema wildcards |
| `load_procedure(schema, name)` | `Procedure` | Load procedure metadata |
| `close()` | `None` | Close connection |

`DB` supports context manager (`with` statement).

### Procedure Class

| Method | Returns | Description |
|---|---|---|
| `call(*input_params)` | `ProcedureResult` | Execute stored procedure |

`Procedure` exposes `params: list[ProcParam]` as a public attribute for introspection.

No `CallTyped` equivalent — Python idiom is `[MyDataclass(**row) for row in result_set]`.

## Public API — Async (`async_hdbhelper.py`)

All async functions/methods delegate to sync equivalents via `asyncio.to_thread()`.

**Thread safety:** `hdbcli` connections are not thread-safe. `AsyncDB` uses an internal `threading.Lock` to serialize access to the underlying connection, preventing corruption when multiple `await` calls are issued concurrently (e.g., via `asyncio.gather`). This means concurrent calls are serialized, not parallel — the async benefit is non-blocking of the event loop, not concurrent database access.

### Factory Functions

| Function | Wraps |
|---|---|
| `async_open(cfg)` | `open(cfg)` |
| `async_open_from_env(**opts)` | `open_from_env(**opts)` |
| `async_open_from_env_file(path, **opts)` | `open_from_env_file(path, **opts)` |

### AsyncDB Class

Same methods as `DB` but all `async`. Supports `async with` context manager. `load_procedure` returns `AsyncProcedure` whose `call()` is also async.

Pure helpers (`resolve_env_path`, `object_name`) remain synchronous — no I/O.

## Environment Resolution

Priority order (same as Go and Node packages):

1. `VCAP_SERVICES` environment variable → parse as JSON
2. `default-env.json` file in CWD → read and parse `VCAP_SERVICES` key
3. Service discovery within VCAP:
   - If `TARGET_CONTAINER` env var or `target_container` param set → match by service `name`
   - Else: find service tagged `"hana"`
   - Fallback: find service tagged `"hana"` with plan `"hdi-shared"`
4. Extract credentials: host, port, user, password, schema, encrypt
5. Schema override via `schema` parameter takes precedence

## Stored Procedure Implementation

Two-phase model matching Go/Node:

**Phase 1 — `load_procedure(schema, name)`:**

- Query `SYS.PROCEDURE_PARAMETERS` with `LEFT JOIN SYS.SYNONYMS` (matching the Node.js SQL, which resolves table-type synonyms)
- Store parameter metadata as list of `ProcParam` (including synonym fields)
- Record the fully-qualified procedure name: `{schema}.{name}`

**Phase 2 — `call(*input_params)`:**

Uses `cursor.callproc()` (DB-API 2.0 standard), not raw `cursor.execute("CALL ...")`. This is the key design decision:

- `cursor.callproc(procname, args)` returns a modified args tuple containing OUT/INOUT scalar values
- Table output parameters are available as result sets via `cursor.fetchall()` / `cursor.nextset()`
- This cleanly separates scalar OUT from table OUT without needing the SQL-template approach

**Parameter handling:**

- IN parameters: passed positionally in the args tuple
- OUT scalar parameters: retrieved from the modified args tuple returned by `callproc()`
- INOUT parameters: passed in the args tuple, modified values returned in the same positions
- Table OUT parameters: iterated via `cursor.nextset()` and `cursor.fetchall()`, converted to `list[dict]`
- Classification uses loaded metadata: `parameter_type` determines IN/OUT/INOUT, `table_type_name` non-empty identifies table outputs

**Result construction:**

- `output_scalar`: dict built from OUT/INOUT scalar param names → values from the returned args tuple
- `result_sets`: list of `list[dict]` from each table output parameter, columns from `cursor.description`
- Returns `ProcedureResult(output_scalar=dict, result_sets=list[list[dict]])`

## Tests

**Framework:** pytest + pytest-asyncio

**Three groups:**

1. **Unit tests (always run):**
   - `resolve_env_path` — path resolution, admin flag
   - `object_name` — `None`→`%`, `""`→`%`, `"*"`→`%`, `"foo"`→`"foo%"`
   - `schema_calc` — `**CURRENT_SCHEMA**`, `*`, passthrough
   - `resolve_service` — VCAP parsing, tag/name matching, errors

2. **Procedure output mapping (always run):**
   - Mock hdbcli cursor to test ProcedureResult construction
   - Scalar + table result set mapping

3. **Integration tests (auto-skip without HANA):**
   - `exec_sql` on DUMMY table
   - `current_schema` query
   - `schema_calc` all modes
   - Stored procedure call
   - Async variants of above

**Auto-skip:** pytest fixture calls `open_from_env()` — on failure, calls `pytest.skip()`.

## CI

New job added to `.github/workflows/ci.yml`:

```yaml
test-hdbhelper-py:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      python-version: ['3.12', '3.13']
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-python@v5
      with:
        python-version: ${{ matrix.python-version }}
    - name: Install dependencies
      run: pip install -e ".[dev]"
      working-directory: hdbhelper-py
    - name: Test
      run: pytest -v
      working-directory: hdbhelper-py
```

## Not In Scope

- SQLAlchemy integration
- Connection pooling (hdbcli handles this internally if needed)
- `CallTyped` generic (not idiomatic Python)
- PyPI publishing workflow (can be added later, like Go's release-go.yml)
- Type stub generation (type hints are inline)

## Design Notes

- **`schema_calc` is an instance method** (not a free function as in Go). The Python `DB` already holds the connection, so `db.schema_calc(schema)` is more ergonomic than `schema_calc(ctx, db, schema)`. Intentional departure from Go for Pythonic API.
- **`exec_sql` accepts optional `params`** — the Go `ExecSQL` takes only a query string. The Python version adds `params=None` for parameterized queries (SQL injection prevention). Intentional improvement over Go parity.
- **Synonym fields in `ProcParam`** follow the Node.js SQL (with `LEFT JOIN SYS.SYNONYMS`), not the Go SQL which omits the synonym join. This provides more complete metadata for table-type resolution.
- **`callproc()` implementation caveat:** `hdbcli`'s specific behavior with table-type OUT parameters via `cursor.nextset()` should be validated during implementation. If `hdbcli` requires a SAP-specific API for table results, the implementation may need adjustment. A spike against a real HANA instance is recommended.
- **Debug logging** uses Python's `logging` module with logger name `"hdbhelper"`, matching the Node packages' `debug("hdbext-promisified")` / `debug("hdb-promisified")` pattern.
- **`hdbcli` installation:** `hdbcli` is on PyPI but is SAP proprietary. Some enterprise environments use internal mirrors. The README should note this.
