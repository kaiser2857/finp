#!/usr/bin/env python3
import sys
from app.database import create_tables, init_sample_data
from app.logger import log

if __name__ == "__main__":
    print("Creating tables...")
    ok = create_tables()
    print(f"create_tables: {ok}")
    print("Initializing sample data...")
    try:
        init_sample_data()
        print("Sample data initialized.")
        sys.exit(0)
    except Exception as e:
        print(f"Sample data init failed: {e}")
        sys.exit(1)
