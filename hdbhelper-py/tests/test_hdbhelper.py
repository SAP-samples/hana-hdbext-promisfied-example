"""Tests for hdbhelper."""

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


from hdbhelper import object_name


def test_object_name_none():
    assert object_name(None) == "%"


def test_object_name_empty():
    assert object_name("") == "%"


def test_object_name_star():
    assert object_name("*") == "%"


def test_object_name_value():
    assert object_name("MY_TABLE") == "MY_TABLE%"


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
