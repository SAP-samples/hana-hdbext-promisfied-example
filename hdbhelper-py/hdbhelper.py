"""SAP HANA helper — wraps hdbcli with environment resolution and stored procedures."""

from __future__ import annotations

import builtins as _builtins
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("hdbhelper")


def resolve_env_path(admin: bool = False) -> str:
    name = "default-env-admin.json" if admin else "default-env.json"
    return os.path.join(os.getcwd(), name)


def object_name(name: str | None) -> str:
    if name is None or name == "" or name == "*":
        return "%"
    return name + "%"


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
            try:
                cursor.execute("SELECT 1 FROM DUMMY")
            finally:
                cursor.close()
            return True
        except Exception:
            return False

    def exec_sql(self, query: str, params: Any = None) -> list[dict[str, Any]]:
        cursor = self._conn.cursor()
        try:
            if params is not None:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            if cursor.description is None:
                return []
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()

    def set_schema(self, schema: str) -> None:
        quoted = '"' + schema.replace('"', '""') + '"'
        cursor = self._conn.cursor()
        try:
            cursor.execute("SET SCHEMA " + quoted)
        finally:
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


class Procedure:
    def __init__(self, schema: str, name: str, params: list[ProcParam], db: DB):
        self.schema = schema
        self.name = name
        self.params = params
        self._db = db

    def call(self, *input_params: Any) -> ProcedureResult:
        cursor = self._db._conn.cursor()
        try:
            proc_name = f'{self.schema}."{self.name}"'

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
                    call_args.append(None)

            result_args = cursor.callproc(proc_name, call_args)

            output_scalar: dict[str, Any] = {}
            result_sets: list[list[dict[str, Any]]] = []

            # Scalar OUT and INOUT values come from the returned args tuple
            arg_idx = 0
            for p in self.params:
                if p.parameter_type in ("OUT", "INOUT") and not p.table_type_name:
                    output_scalar[p.name] = result_args[arg_idx]
                arg_idx += 1

            # Table-type OUT parameters produce result sets via nextset()
            for p in self.params:
                if p.parameter_type == "OUT" and p.table_type_name:
                    desc = cursor.description
                    if desc is None:
                        if not cursor.nextset():
                            break
                        desc = cursor.description
                        if desc is None:
                            break
                    columns = [col[0] for col in desc]
                    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
                    result_sets.append(rows)
                    cursor.nextset()

            return ProcedureResult(
                output_scalar=output_scalar, result_sets=result_sets
            )
        finally:
            cursor.close()


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
