"""SAP HANA helper — wraps hdbcli with environment resolution and stored procedures."""

from __future__ import annotations

import os


def resolve_env_path(admin: bool = False) -> str:
    name = "default-env-admin.json" if admin else "default-env.json"
    return os.path.join(os.getcwd(), name)


def object_name(name: str | None) -> str:
    if name is None or name == "" or name == "*":
        return "%"
    return name + "%"
