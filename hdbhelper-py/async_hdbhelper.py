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
