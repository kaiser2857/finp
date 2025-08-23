#!/usr/bin/env python3
"""
Simple one-off migration to align legacy schema with current models.
- Adds datasources.database_connection_id (UUID, nullable)
- Adds api_endpoint, file_path, configuration (JSONB), cache_timeout, is_active
- Adds FK to database_connections.id if not present

Run: poetry run python scripts/migrate_legacy_schema.py
"""
import os
import sys
import psycopg2
from psycopg2 import sql

DB_URL = os.getenv('DB_URL', 'postgresql://rag:ragpwd@127.0.0.1:5432/analytics')

DDL_STATEMENTS = [
    # Add missing columns on datasources
    "ALTER TABLE IF EXISTS datasources ADD COLUMN IF NOT EXISTS database_connection_id UUID;",
    "ALTER TABLE IF EXISTS datasources ADD COLUMN IF NOT EXISTS api_endpoint VARCHAR(500);",
    "ALTER TABLE IF EXISTS datasources ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);",
    "ALTER TABLE IF EXISTS datasources ADD COLUMN IF NOT EXISTS configuration JSONB DEFAULT '{}'::jsonb;",
    "ALTER TABLE IF EXISTS datasources ADD COLUMN IF NOT EXISTS cache_timeout INTEGER DEFAULT 300;",
    "ALTER TABLE IF EXISTS datasources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;",
]

FK_STATEMENT = (
    "ALTER TABLE IF EXISTS datasources "
    "ADD CONSTRAINT IF NOT EXISTS fk_datasource_dbconn "
    "FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE SET NULL;"
)

CHECK_EXISTENCE_QUERY = """
SELECT 1 FROM information_schema.columns 
WHERE table_name = 'datasources' AND table_schema = 'public' AND column_name = 'database_connection_id';
"""


def main():
    try:
        print(f"Connecting to {DB_URL} ...")
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = True
        cur = conn.cursor()

        # Check if migration is needed
        cur.execute(CHECK_EXISTENCE_QUERY)
        needs_migration = cur.fetchone() is None
        if not needs_migration:
            print("datasources.database_connection_id already exists. Applying any additional missing columns and constraints...")
        else:
            print("database_connection_id missing. Applying migration DDLs...")

        # Apply DDLs idempotently
        for stmt in DDL_STATEMENTS:
            print(f"Applying: {stmt}")
            cur.execute(stmt)

        # Add FK if not exists (Postgres 12+ supports IF NOT EXISTS here)
        print("Ensuring foreign key constraint exists...")
        try:
            cur.execute(FK_STATEMENT)
        except Exception as e:
            # If constraint already exists (older Postgres), ignore
            print(f"FK creation warning (ignored): {e}")

        print("Migration complete.")

        # Show final columns
        print("\nFinal datasources columns:")
        cur.execute(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'datasources' AND table_schema = 'public'
            ORDER BY ordinal_position;
            """
        )
        for col in cur.fetchall():
            print(f"  {col[0]} ({col[1]}) - nullable: {col[2]}")

        cur.close()
        conn.close()
        return 0
    except Exception as e:
        print(f"Migration failed: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
