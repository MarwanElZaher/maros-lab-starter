"""xlsx → list[UnifiedRow]."""
from __future__ import annotations
from pathlib import Path
import openpyxl
from .schemas import UnifiedRow, CLIENT_CONFIGS


def load_xlsx(path: Path, client_key: str) -> list[UnifiedRow]:
    cfg = CLIENT_CONFIGS[client_key]
    col_map = cfg["column_map"]
    client_name = cfg["name"]
    source_file = path.name

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(h).strip().lower() if h else "" for h in rows[0]]
    results: list[UnifiedRow] = []

    for row_idx, row in enumerate(rows[1:], start=2):
        raw = {headers[i]: row[i] for i in range(len(headers))}
        if all(v is None or v == "" for v in raw.values()):
            continue

        # Remap keys to match the column_map (which uses original casing)
        # Build a version with original-casing keys for from_raw
        raw_orig: dict[str, object] = {}
        for src_col in col_map:
            # Try exact, then lower
            if src_col in raw:
                raw_orig[src_col] = raw[src_col]
            elif src_col.lower() in raw:
                raw_orig[src_col] = raw[src_col.lower()]
            else:
                raw_orig[src_col] = ""

        unified = UnifiedRow.from_raw(
            raw=raw_orig,
            column_map=col_map,
            client_name=client_name,
            source_file=source_file,
            source_locator=f"row={row_idx}",
        )
        results.append(unified)

    wb.close()
    return results
