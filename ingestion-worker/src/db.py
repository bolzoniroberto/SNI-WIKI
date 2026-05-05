from contextlib import contextmanager

from psycopg_pool import ConnectionPool

from .config import settings

pool = ConnectionPool(conninfo=settings.database_url, min_size=1, max_size=5, open=False)


def init() -> None:
    pool.open()


def close() -> None:
    pool.close()


@contextmanager
def conn():
    with pool.connection() as c:
        yield c
