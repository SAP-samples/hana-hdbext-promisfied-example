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
