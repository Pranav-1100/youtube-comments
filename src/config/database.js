import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db = null;

export const initializeDatabase = async () => {
  if (db) return db;

  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      content_url TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      username TEXT DEFAULT 'Anonymous',
      timestamp TEXT DEFAULT 'Unknown',
      sentiment_score REAL,
      sentiment_label TEXT,
      likes INTEGER DEFAULT 0,
      avatar_url TEXT,
      is_pinned BOOLEAN DEFAULT 0,
      has_creator_heart BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_platform_url 
    ON comments(platform, content_url);
  `);


  return db;
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};