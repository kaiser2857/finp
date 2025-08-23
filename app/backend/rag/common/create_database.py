#!/usr/bin/env python3
"""Script to create the search_db database and tables."""

import mysql.connector
from mysql.connector import Error
import sys

def create_database():
    """Create the search_db database if it doesn't exist."""
    connection = None
    try:
        # Connect to MySQL server (without specifying database)
        connection = mysql.connector.connect(
            host='localhost',
            port=3306,
            user='root',
            password='123456'
        )
        
        if connection.is_connected():
            cursor = connection.cursor()
            
            # Create database if it doesn't exist
            cursor.execute("CREATE DATABASE IF NOT EXISTS search_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            
            # Use the database
            cursor.execute("USE search_db")
            
            # Create SearchHistory table
            create_search_history_table = """
            CREATE TABLE IF NOT EXISTS SearchHistory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                query TEXT NOT NULL,
                mode VARCHAR(32),
                product VARCHAR(32),
                session_id VARCHAR(36),
                session_index INT,
                create_time DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
            cursor.execute(create_search_history_table)
            
            # Create QAFeedback table
            create_qa_feedback_table = """
            CREATE TABLE IF NOT EXISTS QAFeedback (
                id INT AUTO_INCREMENT PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                rating SMALLINT,
                comments TEXT,
                product VARCHAR(32),
                create_time DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
            cursor.execute(create_qa_feedback_table)
            
            connection.commit()
            
    except Error as e:
        sys.exit(1)
        
    finally:
        if connection and connection.is_connected():
            cursor.close()
            connection.close()

if __name__ == "__main__":
    create_database()
