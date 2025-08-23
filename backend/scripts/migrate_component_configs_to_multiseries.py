#!/usr/bin/env python3
"""
One-off migration: persist legacy line/bar component configs to the new multi-series schema.

What it does (idempotent):
- For components where component_type in ('line','bar')
- If config.encoding.y exists and config.encoding.series is missing:
  - Move y into encoding.series = [{ "y": <old_y>, "label": <stringified y> }]
  - If encoding.color exists, move it to encoding._legacyColor
- For bar charts, ensure options.stacked is present (default False) if missing

Notes:
- This only updates the config JSON. It does not change query_config or other fields.
- Safe to run multiple times.

Run:
  poetry run python backend/scripts/migrate_component_configs_to_multiseries.py
or
  python backend/scripts/migrate_component_configs_to_multiseries.py

Environment:
- Uses DB_URL env var; defaults to: postgresql://rag:ragpwd@127.0.0.1:5432/analytics
"""

import os
import sys
import json
import uuid
import psycopg2
from psycopg2 import extras

DB_URL = os.getenv('DB_URL', 'postgresql://rag:ragpwd@127.0.0.1:5432/analytics')

SELECT_COMPONENTS_SQL = (
    "SELECT id, component_type, config FROM components "
    "WHERE is_active = TRUE AND (LOWER(component_type) = 'line' OR LOWER(component_type) = 'bar');"
)

UPDATE_CONFIG_SQL = "UPDATE components SET config = %s WHERE id = %s;"


def _ensure_dict(d):
    return d if isinstance(d, dict) else {}


def _migrate_config_once(component_type: str, cfg_in):
    """Return (changed: bool, cfg_out: dict)"""
    cfg = _ensure_dict(cfg_in)
    enc = _ensure_dict(cfg.get('encoding'))
    changed = False

    # Move legacy y into series[0]
    if 'series' not in enc and 'y' in enc and enc.get('y') is not None:
        y_val = enc.pop('y', None)
        s_item = {'y': y_val}
        try:
            # Provide a readable label hint
            label = y_val if isinstance(y_val, str) else (str(y_val) if y_val is not None else None)
            if label:
                s_item['label'] = label
        except Exception:
            pass
        # Preserve legacy color (it used to be a grouping dimension / mapping)
        if 'color' in enc and enc.get('color') is not None:
            enc['_legacyColor'] = enc.pop('color')
        enc['series'] = [s_item]
        changed = True

    # Ensure options.stacked default for bar
    if component_type == 'bar':
        opts = _ensure_dict(cfg.get('options'))
        if 'stacked' not in opts:
            opts['stacked'] = False
            cfg['options'] = opts
            changed = True

    cfg['encoding'] = enc
    return changed, cfg


def _coerce_config(value):
    # psycopg2 may return dict or string depending on drivers/settings
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except Exception:
        return {}


def main():
    dry_run = '--dry-run' in sys.argv

    print(f"Connecting to {DB_URL} ...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = not dry_run

    migrated = 0
    examined = 0

    try:
        with conn.cursor(cursor_factory=extras.RealDictCursor) as cur:
            cur.execute(SELECT_COMPONENTS_SQL)
            rows = cur.fetchall()

        with conn.cursor() as cur_upd:
            for row in rows:
                examined += 1
                cid = row['id']
                ctype = str(row['component_type'] or '').lower()
                cfg = _coerce_config(row.get('config'))
                changed, new_cfg = _migrate_config_once(ctype, cfg)
                if changed:
                    migrated += 1
                    if dry_run:
                        print(f"[DRY-RUN] Would migrate component {cid} ({ctype})")
                    else:
                        cur_upd.execute(UPDATE_CONFIG_SQL, [extras.Json(new_cfg), uuid.UUID(str(cid))])

        if not dry_run:
            conn.commit()

        print(f"Examined: {examined}")
        print(f"Migrated: {migrated}")
        if dry_run:
            print("No changes written due to --dry-run")
        else:
            print("Done. Changes committed.")
        return 0
    except Exception as e:
        print(f"Migration failed: {e}")
        if not dry_run:
            try:
                conn.rollback()
            except Exception:
                pass
        return 1
    finally:
        try:
            conn.close()
        except Exception:
            pass


if __name__ == '__main__':
    sys.exit(main())
