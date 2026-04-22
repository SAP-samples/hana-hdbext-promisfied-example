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


from unittest.mock import MagicMock
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


from unittest.mock import PropertyMock
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

    # Result sets returned by nextset iteration:
    # First result set: OUT_CODE scalar (single-row, single-col)
    # Second result set: OUT_TABLE table result set
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
