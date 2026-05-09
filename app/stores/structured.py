"""DuckDB wrapper — structured specs store."""
from __future__ import annotations
from pathlib import Path
from typing import Union
import duckdb
from ..ingest.schemas import CREATE_TABLE_SQL, UnifiedRow


class StructuredStore:
    def __init__(self, db_path: Union[Path, str]):
        if str(db_path) != ":memory:":
            p = Path(db_path)
            p.parent.mkdir(parents=True, exist_ok=True)
        self.db_path = str(db_path)
        self._con = duckdb.connect(self.db_path)
        self.initialize_schema()

    def initialize_schema(self) -> None:
        self._con.execute(CREATE_TABLE_SQL)

    def reset(self) -> None:
        self._con.execute("DROP TABLE IF EXISTS specs")
        self.initialize_schema()

    def insert_rows(self, rows: list) -> None:
        """Accept list[UnifiedRow] or list[dict]."""
        if not rows:
            return
        tuples = []
        for r in rows:
            if isinstance(r, dict):
                tuples.append((
                    r.get("client", ""),
                    r.get("product", ""),
                    r.get("region", ""),
                    r.get("parameter", ""),
                    r.get("value"),
                    r.get("unit", ""),
                    r.get("limit_type", ""),
                    r.get("notes", ""),
                    r.get("source_file", ""),
                    r.get("source_locator", ""),
                ))
            else:
                # UnifiedRow
                tuples.append(r.as_tuple())
        self._con.executemany(
            """
            INSERT INTO specs
              (client, product, region, parameter, value, unit,
               limit_type, notes, source_file, source_locator)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            tuples,
        )

    def query(
        self,
        sql: str | None = None,
        params: list | tuple = (),
        *,
        client: str | None = None,
        parameter: str | None = None,
        region: str | None = None,
        product: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """
        Flexible query interface.
        Either pass raw sql+params, or use keyword args for structured filtering.
        Always uses parameterized binding — never f-strings for user values.
        """
        if sql is not None:
            result = self._con.execute(sql, list(params))
            cols = [d[0] for d in result.description]
            return [dict(zip(cols, row)) for row in result.fetchall()]

        # Keyword-based query
        conditions: list[str] = []
        bound: list = []

        if client is not None:
            conditions.append("client = ?")
            bound.append(client)
        if parameter is not None:
            conditions.append("lower(parameter) LIKE ?")
            bound.append(f"%{parameter.lower()}%")
        if region is not None:
            conditions.append("region = ?")
            bound.append(region)
        if product is not None:
            conditions.append("lower(product) LIKE ?")
            bound.append(f"%{product.lower()}%")

        where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        sql_stmt = f"SELECT * FROM specs{where} LIMIT {limit}"
        result = self._con.execute(sql_stmt, bound)
        cols = [d[0] for d in result.description]
        return [dict(zip(cols, row)) for row in result.fetchall()]

    def search_specs(
        self,
        client: str,
        products: list[str] | None = None,
        regions: list[str] | None = None,
        parameters: list[str] | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Parameterized spec search — never f-strings for client name."""
        conditions = ["client = ?"]
        params: list = [client]

        if products:
            placeholders = ", ".join(["?"] * len(products))
            conditions.append(f"product IN ({placeholders})")
            params.extend(products)

        if regions:
            placeholders = ", ".join(["?"] * len(regions))
            conditions.append(f"region IN ({placeholders})")
            params.extend(regions)

        if parameters:
            like_clauses = " OR ".join(["lower(parameter) LIKE ?" for _ in parameters])
            conditions.append(f"({like_clauses})")
            params.extend([f"%{p.lower()}%" for p in parameters])

        where = " AND ".join(conditions)
        sql = f"SELECT * FROM specs WHERE {where} LIMIT {limit}"
        return self.query(sql, params)

    def close(self) -> None:
        self._con.close()
