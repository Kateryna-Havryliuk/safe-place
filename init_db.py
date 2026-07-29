"""
Database initialization script for Safe Place
Run this script once to create the database and all tables.

Usage:
    python init_db.py
"""

import sqlite3
import os

DB_PATH = 'safeplace.db'

def init_db():
    """Create all tables if they don't exist."""
    
    # Remove old database if exists (optional — comment out if you want to keep data)
    # if os.path.exists(DB_PATH):
    #     os.remove(DB_PATH)
    #     print(f"🗑️ Old database removed.")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute('PRAGMA foreign_keys = ON;')
    
     
    # 1. USERS TABLE
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
     
    # 2. CHATS TABLE
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT DEFAULT 'New Chat',
            message_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
     
    # 3. MESSAGES TABLE
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            sentiment_score REAL DEFAULT 0,
            is_critical BOOLEAN DEFAULT 0,
            emotion TEXT,
            severity INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )
    ''')
    
     
    # 4. USER_ANALYTICS TABLE (daily aggregates)
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            messages_count INTEGER DEFAULT 0,
            avg_sentiment REAL DEFAULT 0,
            crisis_count INTEGER DEFAULT 0,
            positive_count INTEGER DEFAULT 0,
            negative_count INTEGER DEFAULT 0,
            neutral_count INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, date)
        )
    ''')
    
     
    # 5. USER_SESSIONS TABLE
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
     
    # 6. CRISIS_EVENTS TABLE
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crisis_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chat_id INTEGER,
            level TEXT NOT NULL,
            indicators TEXT,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
        )
    ''')
    
     
    # 7. VOICE_ANALYTICS TABLE
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS voice_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chat_id INTEGER,
            message_id INTEGER,
            transcription TEXT,
            pitch_mean REAL,
            pitch_std REAL,
            energy_mean REAL,
            energy_std REAL,
            tempo REAL,
            spectral_centroid_mean REAL,
            emotion TEXT,
            confidence REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
        )
    ''')
    
     
    # 8. MULTIMODAL_ANALYTICS TABLE (fusion results)
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS multimodal_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chat_id INTEGER,
            message_id INTEGER,
            voice_id INTEGER,
            text_sentiment REAL,
            voice_emotion TEXT,
            fused_emotion TEXT,
            fused_confidence REAL,
            crisis_level TEXT,
            fusion_rule TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
            FOREIGN KEY (voice_id) REFERENCES voice_analytics(id) ON DELETE SET NULL
        )
    ''')
    
     
    # 9. VIDEO_ANALYTICS TABLE (reserved for future)
     
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chat_id INTEGER,
            message_id INTEGER,
            emotion TEXT,
            confidence REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
        )
    ''')
    
     
    # 10. INDEXES FOR PERFORMANCE
     
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_analytics_user_date ON user_analytics(user_id, date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_crisis_user_id ON crisis_events(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_voice_user_id ON voice_analytics(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_multimodal_user_id ON multimodal_analytics(user_id)')
    
     
    # COMMIT & CLOSE
     
    conn.commit()
    conn.close()
    
    print(f'✅ Database initialized successfully at: {DB_PATH}')
    print(f'📊 Tables created: users, chats, messages, user_analytics,')
    print(f'   user_sessions, crisis_events, voice_analytics,')
    print(f'   multimodal_analytics, video_analytics')
    print(f'📈 Indexes created for performance.')

def inspect_db():
    """Show all tables and their structure (useful for debugging)."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tables = cursor.fetchall()
    
    print('\n📋 Tables in database:')
    for table in tables:
        print(f'  - {table[0]}')
    
    conn.close()

if __name__ == '__main__':
    print('🛡️ Safe Place — Database Initialization')
    print('=' * 40)
    
    init_db()
    inspect_db()
    
    print('\n💡 To run the server: python app.py')