import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

export class Comment {
  constructor(data) {
    Object.assign(this, data);
  }

  static async create(commentData) {
    logger.debug('Creating new comment', { commentData });
    const db = await getDatabase();
    
    try {
      const result = await db.run(`
        INSERT INTO comments (
          platform, content_url, comment_text, username,
          timestamp, sentiment_score, sentiment_label
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        commentData.platform,
        commentData.content_url,
        commentData.comment_text,
        commentData.username,
        commentData.timestamp,
        commentData.sentiment_score,
        commentData.sentiment_label
      ]);

      logger.debug('Comment created successfully', { id: result.lastID });
      return this.findById(result.lastID);
    } catch (error) {
      logger.error('Error creating comment:', error);
      throw error;
    }
  }

  static async findById(id) {
    logger.debug('Finding comment by ID', { id });
    const db = await getDatabase();
    
    try {
      const row = await db.get('SELECT * FROM comments WHERE id = ?', [id]);
      return row ? new Comment(row) : null;
    } catch (error) {
      logger.error('Error finding comment by ID:', error);
      throw error;
    }
  }

  static async findByUrl(url, platform) {
    logger.debug('Finding comments by URL and platform', { url, platform });
    const db = await getDatabase();
    
    try {
      const rows = await db.all(
        'SELECT * FROM comments WHERE platform = ? AND content_url = ? ORDER BY created_at DESC',
        [platform, url]
      );
      logger.debug(`Found ${rows.length} comments`);
      return rows.map(row => new Comment(row));
    } catch (error) {
      logger.error('Error finding comments by URL:', error);
      throw error;
    }
  }

  static async createMany(commentsData) {
    logger.info(`Creating ${commentsData.length} comments`);
    const db = await getDatabase();
    
    try {
      const stmt = await db.prepare(`
        INSERT INTO comments (
          platform, content_url, comment_text, username,
          timestamp, sentiment_score, sentiment_label
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const results = [];
      for (const comment of commentsData) {
        const result = await stmt.run([
          comment.platform,
          comment.content_url,
          comment.comment_text,
          comment.username,
          comment.timestamp,
          comment.sentiment_score,
          comment.sentiment_label
        ]);
        results.push(result.lastID);
      }

      await stmt.finalize();
      logger.info(`Successfully created ${results.length} comments`);
      return results;
    } catch (error) {
      logger.error('Error creating multiple comments:', error);
      throw error;
    }
  }
  static async deleteByUrl(url, platform) {
    logger.debug('Deleting comments for URL', { url, platform });
    const db = await getDatabase();
    
    try {
      await db.run(
        'DELETE FROM comments WHERE platform = ? AND content_url = ?',
        [platform, url]
      );
      logger.debug('Successfully deleted existing comments');
    } catch (error) {
      logger.error('Error deleting comments:', error);
      throw error;
    }
  }

  static async findByUrl(url, platform) {
    logger.debug('Finding comments by URL and platform', { url, platform });
    const db = await getDatabase();
    
    try {
      const rows = await db.all(
        'SELECT * FROM comments WHERE platform = ? AND content_url = ? ORDER BY created_at DESC',
        [platform, url]
      );
      logger.debug(`Found ${rows.length} comments`);
      return rows.map(row => new Comment(row));
    } catch (error) {
      logger.error('Error finding comments by URL:', error);
      throw error;
    }
  }
}
