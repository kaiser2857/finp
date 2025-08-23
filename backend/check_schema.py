#!/usr/bin/env python3
import psycopg2
import sys

try:
    conn = psycopg2.connect('postgresql://rag:ragpwd@localhost:5432/analytics')
    cur = conn.cursor()
    
    # Check existing tables
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
    tables = cur.fetchall()
    print('Existing tables:')
    for table in tables:
        print(f'  {table[0]}')
    
    # Check datasources table schema
    print('\nDatasources table columns:')
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'datasources' AND table_schema = 'public'
        ORDER BY ordinal_position;
    """)
    columns = cur.fetchall()
    for col in columns:
        print(f'  {col[0]} ({col[1]}) - nullable: {col[2]}')

    # Check column_defs table schema
    print('\ncolumn_defs table columns:')
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'column_defs' AND table_schema = 'public'
        ORDER BY ordinal_position;
    """)
    columns = cur.fetchall()
    for col in columns:
        print(f'  {col[0]} ({col[1]}) - nullable: {col[2]}')

    # Check database_connections table schema
    print('\ndatabase_connections table columns:')
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'database_connections' AND table_schema = 'public'
        ORDER BY ordinal_position;
    """)
    columns = cur.fetchall()
    for col in columns:
        print(f'  {col[0]} ({col[1]}) - nullable: {col[2]}')
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
