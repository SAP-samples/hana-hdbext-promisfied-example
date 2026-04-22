# hdbhelper-py Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Python package wrapping SAP's `hdbcli` driver with environment resolution, SQL execution, stored procedure support, and an async layer.

**Architecture:** Flat single-module layout — `hdbhelper.py` (sync) + `async_hdbhelper.py` (async wrapper via `asyncio.to_thread`). `DB` class wraps `hdbcli.dbapi.connect()`, `Procedure` class uses `cursor.callproc()` for stored procedures.

**Tech Stack:** Python 3.12+, hdbcli, pytest, pytest-asyncio

**Spec:** `docs/superpowers/specs/2026-04-22-hdbhelper-py-design.md`

---

### Task 1: Project scaffolding

**Files:**
- Create: `hdbhelper-py/pyproject.toml`
- Create: `hdbhelper-py/.gitignore`
- Create: `hdbhelper-py/hdbhelper.py` (empty placeholder)
- Create: `hdbhelper-py/async_hdbhelper.py` (empty placeholder)
- Create: `hdbhelper-py/tests/__init__.py`
- Create: `hdbhelper-py/tests/test_hdbhelper.py` (empty placeholder)

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"

[project]
name = "sap-hdbhelper-py"
version = "0.1.0"
description = "Python helper for SAP HANA — wraps hdbcli with environment resolution, SQL execution, and stored procedure support"
requires-python = ">=3.12"
license = "Apache-2.0"
dependencies = [
    "hdbcli",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"

[tool.setuptools]
py-modules = ["hdbhelper", "async_hdbhelper"]
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
__pycache__/
*.pyc
*.pyo
*.egg-info/
dist/
build/
.pytest_cache/
default-*.json
.env
.venv/
```

- [ ] **Step 3: Create empty placeholder files**

Create `hdbhelper-py/hdbhelper.py`:
```python
"""SAP HANA helper — wraps hdbcli with environment resolution and stored procedures."""
```

Create `hdbhelper-py/async_hdbhelper.py`:
```python
"""Async wrapper for hdbhelper using asyncio.to_thread."""
```

Create `hdbhelper-py/tests/__init__.py` (empty file).

Create `hdbhelper-py/tests/test_hdbhelper.py`:
```python
"""Tests for hdbhelper."""
```

- [ ] **Step 4: Verify pip install works**

Run from `hdbhelper-py/`:
```bash
pip install -e ".[dev]"
```
Expected: installs successfully (hdbcli + pytest + pytest-asyncio).

- [ ] **Step 5: Run pytest to confirm empty test discovery**

Run from `hdbhelper-py/`:
```bash
pytest -v
```
Expected: `no tests ran` or `0 items collected`.

- [ ] **Step 6: Commit**

```bash
git add hdbhelper-py/
git commit -m "feat(hdbhelper-py): scaffold Python package with pyproject.toml"
```

---

### Task 2: `resolve_env_path` and `object_name` helpers

**Files:**
- Modify: `hdbhelper-py/hdbhelper.py`
- Modify: `hdbhelper-py/tests/test_hdbhelper.py`

These are pure functions with no I/O dependencies — easiest to TDD first.

- [ ] **Step 1: Write failing tests for `resolve_env_path`**

In `hdbhelper-py/tests/test_hdbhelper.py`:
```python
import os
from hdbhelper import resolve_env_path


def test_resolve_env_path_default():
    result = resolve_env_path()
    expected = os.path.join(os.getcwd(), "default-env.json")
    assert result == expected


def test_resolve_env_path_admin():
    result = resolve_env_path(admin=True)
    expected = os.path.join(os.getcwd(), "default-env-admin.json")
    assert result == expected
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: `ImportError: cannot import name 'resolve_env_path'`

- [ ] **Step 3: Implement `resolve_env_path`**

In `hdbhelper-py/hdbhelper.py`:
```python
"""SAP HANA helper — wraps hdbcli with environment resolution and stored procedures."""

from __future__ import annotations

import os

def resolve_env_path(admin: bool = False) -> str:
    name = "default-env-admin.json" if admin else "default-env.json"
    return os.path.join(os.getcwd(), name)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: 2 passed.

- [ ] **Step 5: Write failing tests for `object_name`**

Append to `hdbhelper-py/tests/test_hdbhelper.py`:
```python
from hdbhelper import object_name


def test_object_name_none():
    assert object_name(None) == "%"


def test_object_name_empty():
    assert object_name("") == "%"


def test_object_name_star():
    assert object_name("*") == "%"


def test_object_name_value():
    assert object_name("MY_TABLE") == "MY_TABLE%"
```

- [ ] **Step 6: Run tests to verify new ones fail**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: 4 fail (`cannot import name 'object_name'`), 2 pass.

- [ ] **Step 7: Implement `object_name`**

Add to `hdbhelper-py/hdbhelper.py`:
```python
def object_name(name: str | None) -> str:
    if name is None or name == "" or name == "*":
        return "%"
    return name + "%"
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: 6 passed.

- [ ] **Step 9: Commit**

```bash
git add hdbhelper-py/hdbhelper.py hdbhelper-py/tests/test_hdbhelper.py
git commit -m "feat(hdbhelper-py): add resolve_env_path and object_name helpers"
```

---

### Task 3: Data types and VCAP_SERVICES environment resolution

**Files:**
- Modify: `hdbhelper-py/hdbhelper.py`
- Modify: `hdbhelper-py/tests/test_hdbhelper.py`

This task implements `ConnectionConfig`, the internal VCAP parsing, and `_resolve_service`. Tests use synthetic JSON — no HANA needed.

- [ ] **Step 1: Write failing tests for VCAP service resolution**

Append to `hdbhelper-py/tests/test_hdbhelper.py`:
```python
import json
import pytest
from hdbhelper import ConnectionConfig, _resolve_service, _parse_vcap


VCAP_JSON = {
    "hana": [{
        "name": "my-hana",
        "tags": ["hana"],
        "plan": "hdi-shared",
        "credentials": {
            "host": "hana.cloud.sap",
            "port": 443,
            "user": "DBADMIN",
            "password": "secret",
            "schema": "MY_SCHEMA",
            "encrypt": True
        }
    }],
    "xsuaa": [{
        "name": "my-xsuaa",
        "tags": ["xsuaa"],
        "credentials": {"url": "https://auth"}
    }]
}


def test_resolve_service_by_tag():
    svc = _resolve_service(VCAP_JSON, target_container="")
    assert svc["name"] == "my-hana"


def test_resolve_service_by_name():
    svc = _resolve_service(VCAP_JSON, target_container="my-hana")
    assert svc["name"] == "my-hana"


def test_resolve_service_not_found():
    with pytest.raises(ValueError, match="no service with name"):
        _resolve_service(VCAP_JSON, target_container="nonexistent")


def test_resolve_service_no_hana():
    vcap = {"xsuaa": [{"name": "x", "tags": ["xsuaa"], "credentials": {}}]}
    with pytest.raises(ValueError, match="no HANA service found"):
        _resolve_service(vcap, target_container="")


def test_parse_vcap_extracts_config():
    cfg = _parse_vcap(VCAP_JSON, target_container="", schema_override="")
    assert cfg.host == "hana.cloud.sap"
    assert cfg.port == 443
    assert cfg.user == "DBADMIN"
    assert cfg.password == "secret"
    assert cfg.schema == "MY_SCHEMA"
    assert cfg.encrypt is True


def test_parse_vcap_schema_override():
    cfg = _parse_vcap(VCAP_JSON, target_container="", schema_override="OVERRIDE")
    assert cfg.schema == "OVERRIDE"


def test_parse_vcap_port_as_string():
    vcap = {"hana": [{
        "name": "h", "tags": ["hana"], "credentials": {
            "host": "h", "port": "30015", "user": "u", "password": "p"
        }
    }]}
    cfg = _parse_vcap(vcap, target_container="", schema_override="")
    assert cfg.port == 30015


def test_parse_vcap_port_default():
    vcap = {"hana": [{
        "name": "h", "tags": ["hana"], "credentials": {
            "host": "h", "user": "u", "password": "p"
        }
    }]}
    cfg = _parse_vcap(vcap, target_container="", schema_override="")
    assert cfg.port == 443
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: New tests fail with `ImportError`.

- [ ] **Step 3: Implement dataclasses and VCAP resolution**

Add to `hdbhelper-py/hdbhelper.py`:
```python
import json
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("hdbhelper")


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
    parameter_type: str
    has_default: str
    is_inplace: str
    table_type_schema: str
    table_type_name: str
    is_table_type_synonym: str
    object_schema: str
    object_name: str


@dataclass
class ProcedureResult:
    output_scalar: dict[str, Any]
    result_sets: list[list[dict[str, Any]]]


def _resolve_service(services: dict, target_container: str) -> dict:
    if target_container:
        for svcs in services.values():
            for svc in svcs:
                if svc.get("name") == target_container:
                    return svc
        raise ValueError(
            f"hdbhelper: no service with name {target_container!r} found in VCAP_SERVICES"
        )

    for svcs in services.values():
        for svc in svcs:
            if "hana" in svc.get("tags", []):
                return svc

    for svcs in services.values():
        for svc in svcs:
            if "hana" in svc.get("tags", []) and svc.get("plan") == "hdi-shared":
                return svc

    raise ValueError(
        "hdbhelper: no HANA service found in VCAP_SERVICES (searched by tag 'hana')"
    )


def _parse_port(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return 443
    return 443


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return False


def _parse_vcap(
    services: dict, target_container: str, schema_override: str
) -> ConnectionConfig:
    svc = _resolve_service(services, target_container)
    creds = svc.get("credentials", {})
    cfg = ConnectionConfig(
        host=creds.get("host", ""),
        port=_parse_port(creds.get("port")),
        user=creds.get("user", ""),
        password=creds.get("password", ""),
        schema=creds.get("schema", ""),
        encrypt=_parse_bool(creds.get("encrypt")),
    )
    if schema_override:
        cfg.schema = schema_override
    return cfg
```

- [ ] **Step 4: Run all tests**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: All pass (14 tests).

- [ ] **Step 5: Commit**

```bash
git add hdbhelper-py/hdbhelper.py hdbhelper-py/tests/test_hdbhelper.py
git commit -m "feat(hdbhelper-py): add ConnectionConfig, VCAP parsing, service resolution"
```

---

### Task 4: `open`, `open_from_env`, `open_from_env_file` factory functions and `DB` class

**Files:**
- Modify: `hdbhelper-py/hdbhelper.py`
- Modify: `hdbhelper-py/tests/test_hdbhelper.py`

The `DB` class wraps an `hdbcli.dbapi` connection. Factory functions parse environment and delegate to `open()`. Tests cover the env-file loading path; actual connection attempts will fail without HANA (tested via file parse, not live connection).

**Important implementation note:** The `open` function name shadows the Python builtin. The implementation aliases the builtin internally via `import builtins` to avoid the conflict. This is a deliberate API design choice matching the Go package's `Open()`.

- [ ] **Step 1: Write failing tests for env file loading and DB class**

Append to `hdbhelper-py/tests/test_hdbhelper.py`:
```python
from hdbhelper import open_from_env_file, DB


def test_open_from_env_file_parses_vcap(tmp_path):
    env_file = tmp_path / "default-env.json"
    env_file.write_text(json.dumps({
        "VCAP_SERVICES": {
            "hana": [{
                "name": "test-hana",
                "tags": ["hana"],
                "credentials": {
                    "host": "localhost",
                    "port": 30015,
                    "user": "SYSTEM",
                    "password": "secret",
                    "schema": "TEST_SCHEMA",
                    "encrypt": False
                }
            }]
        }
    }))
    with pytest.raises(Exception):
        open_from_env_file(str(env_file))


def test_open_from_env_file_missing():
    with pytest.raises(FileNotFoundError):
        open_from_env_file("/nonexistent/default-env.json")


def test_open_from_env_file_no_vcap(tmp_path):
    env_file = tmp_path / "default-env.json"
    env_file.write_text('{"other": "data"}')
    with pytest.raises(ValueError, match="no VCAP_SERVICES"):
        open_from_env_file(str(env_file))


def test_schema_calc_wildcard():
    """schema_calc('*') is a pure operation — no DB needed."""
    mock_db = MagicMock(spec=DB)
    mock_db.schema_calc = DB.schema_calc.__get__(mock_db, DB)
    assert mock_db.schema_calc("*") == "%"


def test_schema_calc_passthrough():
    """schema_calc with a plain string is a pure operation — no DB needed."""
    mock_db = MagicMock(spec=DB)
    mock_db.schema_calc = DB.schema_calc.__get__(mock_db, DB)
    assert mock_db.schema_calc("MY_SCHEMA") == "MY_SCHEMA"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_hdbhelper.py::test_open_from_env_file_parses_vcap -v`
Expected: `ImportError: cannot import name 'open_from_env_file'`

- [ ] **Step 3: Implement `DB` class and factory functions**

Add to `hdbhelper-py/hdbhelper.py`:
```python
import builtins as _builtins


class DB:
    def __init__(self, conn, schema: str = ""):
        self._conn = conn
        self._schema = schema

    def close(self) -> None:
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def ping(self) -> bool:
        try:
            cursor = self._conn.cursor()
            cursor.execute("SELECT 1 FROM DUMMY")
            cursor.close()
            return True
        except Exception:
            return False

    def exec_sql(self, query: str, params: Any = None) -> list[dict[str, Any]]:
        cursor = self._conn.cursor()
        if params is not None:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        if cursor.description is None:
            cursor.close()
            return []
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        cursor.close()
        return rows

    def set_schema(self, schema: str) -> None:
        quoted = '"' + schema.replace('"', '""') + '"'
        cursor = self._conn.cursor()
        cursor.execute("SET SCHEMA " + quoted)
        cursor.close()
        self._schema = schema

    def current_schema(self) -> str:
        rows = self.exec_sql("SELECT CURRENT_SCHEMA FROM DUMMY")
        return rows[0]["CURRENT_SCHEMA"]

    def schema_calc(self, schema: str) -> str:
        if schema == "**CURRENT_SCHEMA**":
            return self.current_schema()
        if schema == "*":
            return "%"
        return schema


def open(cfg: ConnectionConfig) -> DB:
    from hdbcli import dbapi
    logger.debug("connecting to %s:%d", cfg.host, cfg.port)
    conn = dbapi.connect(
        address=cfg.host,
        port=cfg.port,
        user=cfg.user,
        password=cfg.password,
        encrypt=cfg.encrypt,
        sslValidateCertificate=cfg.encrypt,
    )
    db = DB(conn, schema=cfg.schema)
    if cfg.schema:
        db.set_schema(cfg.schema)
    return db


def open_from_env(
    target_container: str | None = None, schema: str | None = None
) -> DB:
    tc = target_container or os.environ.get("TARGET_CONTAINER", "")

    vcap_raw = os.environ.get("VCAP_SERVICES")
    if vcap_raw:
        services = json.loads(vcap_raw)
        cfg = _parse_vcap(services, tc, schema or "")
        return open(cfg)

    env_path = resolve_env_path()
    return open_from_env_file(env_path, target_container=target_container, schema=schema)


def open_from_env_file(
    path: str, target_container: str | None = None, schema: str | None = None
) -> DB:
    tc = target_container or os.environ.get("TARGET_CONTAINER", "")

    with _builtins.open(path) as f:
        data = json.load(f)

    vcap = data.get("VCAP_SERVICES")
    if vcap is None:
        raise ValueError(f"hdbhelper: no VCAP_SERVICES key in {path}")

    cfg = _parse_vcap(vcap, tc, schema or "")
    return open(cfg)
```

- [ ] **Step 4: Run all tests**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: All pass. The `test_open_from_env_file_parses_vcap` test raises an exception from `hdbcli.dbapi.connect()` (connection refused), which is caught by `pytest.raises(Exception)`.

- [ ] **Step 5: Commit**

```bash
git add hdbhelper-py/hdbhelper.py hdbhelper-py/tests/test_hdbhelper.py
git commit -m "feat(hdbhelper-py): add DB class, open, open_from_env, open_from_env_file"
```

---

### Task 5: Stored procedure support — `Procedure` class and `load_procedure`

**Files:**
- Modify: `hdbhelper-py/hdbhelper.py`
- Modify: `hdbhelper-py/tests/test_hdbhelper.py`

This task adds the `Procedure` class with `load_procedure` (metadata loading) and `call` (execution). Unit tests use mock cursors; live HANA tests are in the integration task.

- [ ] **Step 1: Write failing tests for procedure with mock cursor**

Append to `hdbhelper-py/tests/test_hdbhelper.py`:
```python
from unittest.mock import MagicMock, PropertyMock
from hdbhelper import Procedure, ProcParam, ProcedureResult


def _make_proc_params():
    """Create sample IN + OUT scalar + OUT table procedure params."""
    return [
        ProcParam(name="IN_VAL", data_type="NVARCHAR", parameter_type="IN",
                  has_default="FALSE", is_inplace="FALSE",
                  table_type_schema="", table_type_name="",
                  is_table_type_synonym="FALSE", object_schema="", object_name=""),
        ProcParam(name="OUT_CODE", data_type="INTEGER", parameter_type="OUT",
                  has_default="FALSE", is_inplace="FALSE",
                  table_type_schema="", table_type_name="",
                  is_table_type_synonym="FALSE", object_schema="", object_name=""),
        ProcParam(name="OUT_TABLE", data_type="TABLE_TYPE", parameter_type="OUT",
                  has_default="FALSE", is_inplace="FALSE",
                  table_type_schema="SYS", table_type_name="MY_TABLE_TYPE",
                  is_table_type_synonym="FALSE", object_schema="", object_name=""),
    ]


def test_procedure_params_exposed():
    params = _make_proc_params()
    mock_db = MagicMock()
    proc = Procedure(schema="SYS", name="MY_PROC", params=params, db=mock_db)
    assert proc.params == params
    assert len(proc.params) == 3


def test_procedure_call_maps_results():
    """Test that call() correctly maps scalar OUT + table OUT results."""
    params = _make_proc_params()

    mock_cursor = MagicMock()
    # callproc returns args including OUT placeholders
    mock_cursor.callproc.return_value = ("test_input", None, None)

    # First nextset call: OUT_CODE scalar (single-row, single-col result set)
    # Second nextset call: OUT_TABLE table result set
    descriptions = [
        [("OUT_CODE",)],                          # scalar OUT
        [("ID",), ("NAME",)],                     # table OUT
    ]
    fetchall_results = [
        [(42,)],                                   # scalar value
        [(1, "Alice"), (2, "Bob")],                # table rows
    ]
    desc_iter = iter(descriptions)
    fetch_iter = iter(fetchall_results)

    type(mock_cursor).description = PropertyMock(side_effect=lambda: next(desc_iter))
    mock_cursor.fetchall.side_effect = lambda: next(fetch_iter)
    mock_cursor.nextset.side_effect = [True, False]

    mock_db = MagicMock()
    mock_db._conn.cursor.return_value = mock_cursor

    proc = Procedure(schema="SYS", name="MY_PROC", params=params, db=mock_db)
    result = proc.call("test_input")

    assert result.output_scalar["OUT_CODE"] == 42
    assert len(result.result_sets) == 1
    assert result.result_sets[0] == [{"ID": 1, "NAME": "Alice"}, {"ID": 2, "NAME": "Bob"}]

    # Verify callproc was called with 3 args (IN + OUT placeholder + OUT placeholder)
    mock_cursor.callproc.assert_called_once()
    call_args = mock_cursor.callproc.call_args[0]
    assert call_args[0] == 'SYS."MY_PROC"'
    assert call_args[1] == ["test_input", None, None]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_hdbhelper.py::test_procedure_params_exposed -v`
Expected: `ImportError: cannot import name 'Procedure'`

- [ ] **Step 3: Implement `Procedure` class and `load_procedure`**

Add the metadata SQL constant to `hdbhelper-py/hdbhelper.py`:
```python
_SQL_PROCEDURE_METADATA = """\
SELECT
    PARAMS.PARAMETER_NAME,
    PARAMS.DATA_TYPE_NAME,
    PARAMS.PARAMETER_TYPE,
    PARAMS.HAS_DEFAULT_VALUE,
    PARAMS.IS_INPLACE_TYPE,
    PARAMS.TABLE_TYPE_SCHEMA,
    PARAMS.TABLE_TYPE_NAME,
    CASE WHEN SYNONYMS.OBJECT_NAME IS NULL THEN 'FALSE'
         ELSE 'TRUE' END AS IS_TABLE_TYPE_SYNONYM,
    IFNULL(SYNONYMS.OBJECT_SCHEMA, '') AS OBJECT_SCHEMA,
    IFNULL(SYNONYMS.OBJECT_NAME, '') AS OBJECT_NAME
FROM SYS.PROCEDURE_PARAMETERS AS PARAMS
LEFT JOIN SYS.SYNONYMS AS SYNONYMS
    ON SYNONYMS.SCHEMA_NAME = PARAMS.TABLE_TYPE_SCHEMA
    AND SYNONYMS.SYNONYM_NAME = PARAMS.TABLE_TYPE_NAME
WHERE PARAMS.SCHEMA_NAME = ? AND PARAMS.PROCEDURE_NAME = ?
ORDER BY PARAMS.POSITION"""
```

Add the `Procedure` class:
```python
class Procedure:
    def __init__(self, schema: str, name: str, params: list[ProcParam], db: DB):
        self.schema = schema
        self.name = name
        self.params = params
        self._db = db

    def call(self, *input_params: Any) -> ProcedureResult:
        cursor = self._db._conn.cursor()
        proc_name = f'{self.schema}."{self.name}"'

        # Build args list for callproc — must include ALL params (IN, OUT, INOUT)
        call_args = []
        input_idx = 0
        for p in self.params:
            if p.parameter_type in ("IN", "INOUT"):
                if input_idx < len(input_params):
                    call_args.append(input_params[input_idx])
                    input_idx += 1
                else:
                    call_args.append(None)
            elif p.parameter_type == "OUT":
                call_args.append(None)  # placeholder for OUT parameter

        result_args = cursor.callproc(proc_name, call_args)

        output_scalar: dict[str, Any] = {}
        result_sets: list[list[dict[str, Any]]] = []

        # Collect INOUT scalar values from returned args
        arg_idx = 0
        for p in self.params:
            if p.parameter_type == "INOUT" and not p.table_type_name:
                output_scalar[p.name] = result_args[arg_idx]
            arg_idx += 1

        # Collect OUT scalar and table result sets via nextset()
        has_results = cursor.description is not None
        for p in self.params:
            if p.parameter_type != "OUT":
                continue
            if not has_results:
                break
            columns = [col[0] for col in cursor.description]
            if p.table_type_name:
                rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
                result_sets.append(rows)
            else:
                rows = cursor.fetchall()
                if rows:
                    output_scalar[p.name] = rows[0][0]
            has_results = cursor.nextset()

        cursor.close()
        return ProcedureResult(
            output_scalar=output_scalar, result_sets=result_sets
        )
```

Add `load_procedure` method to the `DB` class:
```python
    def load_procedure(self, schema: str, name: str) -> Procedure:
        if not schema:
            schema = self.current_schema()
        rows = self.exec_sql(_SQL_PROCEDURE_METADATA, (schema, name))
        params = [
            ProcParam(
                name=row["PARAMETER_NAME"],
                data_type=row["DATA_TYPE_NAME"],
                parameter_type=row["PARAMETER_TYPE"],
                has_default=row["HAS_DEFAULT_VALUE"],
                is_inplace=row["IS_INPLACE_TYPE"],
                table_type_schema=row["TABLE_TYPE_SCHEMA"],
                table_type_name=row["TABLE_TYPE_NAME"],
                is_table_type_synonym=row["IS_TABLE_TYPE_SYNONYM"],
                object_schema=row["OBJECT_SCHEMA"],
                object_name=row["OBJECT_NAME"],
            )
            for row in rows
        ]
        return Procedure(schema=schema, name=name, params=params, db=self)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_hdbhelper.py::test_procedure_params_exposed -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hdbhelper-py/hdbhelper.py hdbhelper-py/tests/test_hdbhelper.py
git commit -m "feat(hdbhelper-py): add Procedure class, load_procedure, and stored procedure call"
```

---

### Task 6: Async layer — `AsyncDB` and `AsyncProcedure`

**Files:**
- Modify: `hdbhelper-py/async_hdbhelper.py`
- Modify: `hdbhelper-py/tests/test_hdbhelper.py`

- [ ] **Step 1: Write failing test for async factory and exec_sql**

Append to `hdbhelper-py/tests/test_hdbhelper.py`:
```python
import pytest
from async_hdbhelper import AsyncDB


@pytest.mark.asyncio
async def test_async_db_wraps_sync():
    """Test that AsyncDB delegates to sync DB."""
    mock_db = MagicMock()
    mock_db.exec_sql.return_value = [{"VAL": 1}]
    mock_db.close.return_value = None

    adb = AsyncDB(mock_db)
    result = await adb.exec_sql("SELECT 1 FROM DUMMY")
    assert result == [{"VAL": 1}]
    mock_db.exec_sql.assert_called_once_with("SELECT 1 FROM DUMMY", None)

    await adb.close()
    mock_db.close.assert_called_once()


@pytest.mark.asyncio
async def test_async_db_context_manager():
    """Test async with support."""
    mock_db = MagicMock()
    mock_db.close.return_value = None

    async with AsyncDB(mock_db) as adb:
        assert adb is not None
    mock_db.close.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_hdbhelper.py::test_async_db_wraps_sync -v`
Expected: `ImportError`.

- [ ] **Step 3: Implement `async_hdbhelper.py`**

Write `hdbhelper-py/async_hdbhelper.py`:
```python
"""Async wrapper for hdbhelper using asyncio.to_thread."""

from __future__ import annotations

import asyncio
import threading
from typing import Any

import hdbhelper


class AsyncProcedure:
    def __init__(self, proc: hdbhelper.Procedure, lock: threading.Lock):
        self._proc = proc
        self._lock = lock
        self.params = proc.params

    async def call(self, *input_params: Any) -> hdbhelper.ProcedureResult:
        def _call():
            with self._lock:
                return self._proc.call(*input_params)
        return await asyncio.to_thread(_call)


class AsyncDB:
    def __init__(self, db: hdbhelper.DB):
        self._db = db
        self._lock = threading.Lock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        await self.close()

    async def exec_sql(
        self, query: str, params: Any = None
    ) -> list[dict[str, Any]]:
        def _exec():
            with self._lock:
                return self._db.exec_sql(query, params)
        return await asyncio.to_thread(_exec)

    async def ping(self) -> bool:
        def _ping():
            with self._lock:
                return self._db.ping()
        return await asyncio.to_thread(_ping)

    async def set_schema(self, schema: str) -> None:
        def _set():
            with self._lock:
                self._db.set_schema(schema)
        await asyncio.to_thread(_set)

    async def current_schema(self) -> str:
        def _get():
            with self._lock:
                return self._db.current_schema()
        return await asyncio.to_thread(_get)

    async def schema_calc(self, schema: str) -> str:
        def _calc():
            with self._lock:
                return self._db.schema_calc(schema)
        return await asyncio.to_thread(_calc)

    async def load_procedure(
        self, schema: str, name: str
    ) -> AsyncProcedure:
        def _load():
            with self._lock:
                return self._db.load_procedure(schema, name)
        proc = await asyncio.to_thread(_load)
        return AsyncProcedure(proc, self._lock)

    async def close(self) -> None:
        def _close():
            with self._lock:
                self._db.close()
        await asyncio.to_thread(_close)


async def async_open(cfg: hdbhelper.ConnectionConfig) -> AsyncDB:
    db = await asyncio.to_thread(hdbhelper.open, cfg)
    return AsyncDB(db)


async def async_open_from_env(
    target_container: str | None = None, schema: str | None = None
) -> AsyncDB:
    db = await asyncio.to_thread(
        hdbhelper.open_from_env,
        target_container=target_container,
        schema=schema,
    )
    return AsyncDB(db)


async def async_open_from_env_file(
    path: str,
    target_container: str | None = None,
    schema: str | None = None,
) -> AsyncDB:
    db = await asyncio.to_thread(
        hdbhelper.open_from_env_file,
        path,
        target_container=target_container,
        schema=schema,
    )
    return AsyncDB(db)
```

- [ ] **Step 4: Run async tests to verify they pass**

Run: `pytest tests/test_hdbhelper.py -k async -v`
Expected: 2 passed.

- [ ] **Step 5: Run full test suite**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add hdbhelper-py/async_hdbhelper.py hdbhelper-py/tests/test_hdbhelper.py
git commit -m "feat(hdbhelper-py): add AsyncDB, AsyncProcedure, async factory functions"
```

---

### Task 7: Integration tests with auto-skip

**Files:**
- Modify: `hdbhelper-py/tests/test_hdbhelper.py`

Integration tests connect to a real HANA instance. They auto-skip when no credentials are available.

- [ ] **Step 1: Add integration test fixtures and tests**

Append to `hdbhelper-py/tests/test_hdbhelper.py`:
```python
@pytest.fixture
def hana_db():
    """Connect to HANA or skip. Yields a DB, closes on teardown."""
    try:
        from hdbhelper import open_from_env
        db = open_from_env()
    except Exception as e:
        pytest.skip(f"HANA not reachable: {e}")
    yield db
    db.close()


@pytest.fixture
async def async_hana_db():
    """Async connect to HANA or skip."""
    try:
        from async_hdbhelper import async_open_from_env
        db = await async_open_from_env()
    except Exception as e:
        pytest.skip(f"HANA not reachable: {e}")
    yield db
    await db.close()


class TestIntegration:
    def test_exec_sql(self, hana_db):
        rows = hana_db.exec_sql('SELECT 1 AS "VAL" FROM DUMMY')
        assert len(rows) == 1
        assert rows[0]["VAL"] is not None

    def test_current_schema(self, hana_db):
        schema = hana_db.current_schema()
        assert schema != ""

    def test_ping(self, hana_db):
        assert hana_db.ping() is True

    def test_schema_calc_current(self, hana_db):
        schema = hana_db.schema_calc("**CURRENT_SCHEMA**")
        assert schema != ""

    def test_schema_calc_wildcard(self, hana_db):
        assert hana_db.schema_calc("*") == "%"

    def test_schema_calc_passthrough(self, hana_db):
        assert hana_db.schema_calc("MY_SCHEMA") == "MY_SCHEMA"

    def test_exec_sql_error(self, hana_db):
        with pytest.raises(Exception):
            hana_db.exec_sql("SELECT * FROM NONEXISTENT_TABLE_XYZ")

    def test_load_and_call_procedure(self, hana_db):
        """Integration test for stored procedure load + call."""
        schema = hana_db.current_schema()
        try:
            proc = hana_db.load_procedure("SYS", "IS_VALID_PASSWORD")
            result = proc.call("TestPassword1!")
            assert isinstance(result.output_scalar, dict)
            assert isinstance(result.result_sets, list)
        except Exception:
            pytest.skip("SYS.IS_VALID_PASSWORD not available")


class TestAsyncIntegration:
    @pytest.mark.asyncio
    async def test_async_exec_sql(self, async_hana_db):
        rows = await async_hana_db.exec_sql('SELECT 1 AS "VAL" FROM DUMMY')
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_async_current_schema(self, async_hana_db):
        schema = await async_hana_db.current_schema()
        assert schema != ""

    @pytest.mark.asyncio
    async def test_async_ping(self, async_hana_db):
        assert await async_hana_db.ping() is True
```

- [ ] **Step 2: Run tests**

Run: `pytest tests/test_hdbhelper.py -v`
Expected: Unit tests pass. Integration tests either pass (if HANA available) or show as SKIPPED.

- [ ] **Step 3: Commit**

```bash
git add hdbhelper-py/tests/test_hdbhelper.py
git commit -m "feat(hdbhelper-py): add integration tests with auto-skip"
```

---

### Task 8: CI workflow and README

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `hdbhelper-py/README.md`
- Modify: `README.md` (root)

- [ ] **Step 1: Add Python test job to CI**

Append to `.github/workflows/ci.yml` (after the `test-hdbhelper` job):

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

- [ ] **Step 2: Write `README.md`**

Create `hdbhelper-py/README.md` following the same structure as `hdbhelper/README.md` (the Go package README). Cover:

1. Description with before/after code comparison showing boilerplate reduction
2. Installation: `pip install -e .` for development, note that `hdbcli` is SAP proprietary (available on PyPI but some enterprise envs use internal mirrors)
3. Usage sections:
   - Creating connections (three ways: `open`, `open_from_env`, `open_from_env_file`)
   - Querying (`exec_sql`, `current_schema`, `set_schema`, `schema_calc`)
   - Stored procedures (`load_procedure` + `call`)
   - Async usage (`AsyncDB`, `async_open_from_env`, context managers)
4. API reference table (mirror the Go README format)
5. Environment configuration (`default-env.json` format)
6. Requirements (Python 3.12+, hdbcli, HANA instance)

- [ ] **Step 3: Update root `README.md`**

Add `hdbhelper-py` to the packages table in the root `README.md`, following the existing pattern:

| Package | Language | Wraps | Runtime |
| --- | --- | --- | --- |
| `hdbhelper-py/` | Python | `hdbcli` | Python 3.12+ |

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml hdbhelper-py/README.md README.md
git commit -m "feat(hdbhelper-py): add CI workflow and README"
```

---

### Task 9: Update CLAUDE.md and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Add `hdbhelper-py/` to the repository structure section:
```
- `hdbhelper-py/` — Python helper wrapping `hdbcli` (`sap-hdbhelper-py`, Python >=3.12)
```

Add Python commands section:
```markdown
### Python (run from inside `hdbhelper-py/`)

    pip install -e ".[dev]"  # Install with dev dependencies
    pytest -v                 # Run tests (integration tests auto-skip without HANA)
```

Update the CI section to mention the `test-hdbhelper-py` job with Python 3.12+3.13 matrix.

- [ ] **Step 2: Run full test suite one final time**

Run from `hdbhelper-py/`:
```bash
pytest -v
```
Expected: All unit tests pass. Integration tests skipped (no HANA in local env).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with hdbhelper-py package"
```
