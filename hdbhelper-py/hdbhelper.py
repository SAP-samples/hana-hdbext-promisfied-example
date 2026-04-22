"""SAP HANA helper — wraps hdbcli with environment resolution and stored procedures."""

from __future__ import annotations

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
