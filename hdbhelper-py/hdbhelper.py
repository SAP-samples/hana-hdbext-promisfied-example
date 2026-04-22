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
