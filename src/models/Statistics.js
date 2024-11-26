import { getDatabase } from '../config/database.js';

export class Statistics {
  static async getCommentStats(url, platform, startDate = null, endDate = null) {
    const db = await getDatabase();
    
    let query = `
      SELECT 
        COUNT(*) as total_comments,
        AVG(sentiment_score) as average_sentiment,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count
      FROM comments
      WHERE platform = ? AND content_url = ?
    `;

    const params = [platform, url];

    if (startDate) {
      query += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    const stats = await db.get(query, params);
    
    return {
      ...stats,
      sentiment_distribution: {
        positive: (stats.positive_count / stats.total_comments) * 100 || 0,
        neutral: (stats.neutral_count / stats.total_comments) * 100 || 0,
        negative: (stats.negative_count / stats.total_comments) * 100 || 0
      }
    };
  }

  static async getTimeSeriesData(url, platform, startDate, endDate) {
    const db = await getDatabase();
    
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as comment_count,
        AVG(sentiment_score) as average_sentiment,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count
      FROM comments
      WHERE platform = ? 
        AND content_url = ?
        AND created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    return db.all(query, [platform, url, startDate, endDate]);
  }

  static async getPlatformStats() {
    const db = await getDatabase();
    
    const query = `
      SELECT 
        platform,
        COUNT(*) as total_comments,
        AVG(sentiment_score) as average_sentiment,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count
      FROM comments
      GROUP BY platform
    `;

    return db.all(query);
  }

  static async getSentimentTrends(startDate, endDate) {
    const db = await getDatabase();
    
    const query = `
      WITH daily_sentiments AS (
        SELECT 
          DATE(created_at) as date,
          AVG(sentiment_score) as average_sentiment,
          COUNT(*) as total_comments,
          SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
          SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
          SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count
        FROM comments
        WHERE created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
      )
      SELECT 
        date,
        average_sentiment,
        CASE 
          WHEN positive_count >= neutral_count AND positive_count >= negative_count THEN 'positive'
          WHEN negative_count >= neutral_count AND negative_count >= positive_count THEN 'negative'
          ELSE 'neutral'
        END as dominant_sentiment
      FROM daily_sentiments
      ORDER BY date ASC
    `;

    return db.all(query, [startDate, endDate]);
  }

  static async getEngagementMetrics(url, platform) {
    const db = await getDatabase();
    
    // Get hourly frequency
    const hourlyQuery = `
      SELECT 
        COUNT(*) as comment_count,
        strftime('%H', created_at) as hour
      FROM comments
      WHERE platform = ? AND content_url = ?
      GROUP BY hour
      ORDER BY comment_count DESC
    `;

    const hourlyStats = await db.all(hourlyQuery, [platform, url]);

    // Get user engagement metrics
    const userQuery = `
      SELECT 
        COUNT(DISTINCT username) as unique_users,
        COUNT(*) as total_comments,
        COUNT(*) * 1.0 / COUNT(DISTINCT username) as avg_comments_per_user,
        SUM(CASE WHEN comment_count > 1 THEN 1 ELSE 0 END) as repeat_commenters
      FROM (
        SELECT username, COUNT(*) as comment_count
        FROM comments
        WHERE platform = ? AND content_url = ?
        GROUP BY username
      ) user_stats
    `;

    const userStats = await db.get(userQuery, [platform, url]);

    // Determine peak and low activity hours
    const sortedHours = hourlyStats.sort((a, b) => b.comment_count - a.comment_count);
    const peakHours = sortedHours.slice(0, 3).map(h => h.hour);
    const lowActivityHours = sortedHours.slice(-3).map(h => h.hour);

    return {
      hourly_frequency: hourlyStats,
      daily_frequency: Math.round(userStats.total_comments / 7), // Assuming a week of data
      weekly_frequency: userStats.total_comments,
      unique_users: userStats.unique_users,
      repeat_commenters: userStats.repeat_commenters,
      avg_comments_per_user: userStats.avg_comments_per_user,
      peak_hours: peakHours,
      low_activity_hours: lowActivityHours
    };
  }
  static async getActivityPatterns(url, platform) {
    const db = await getDatabase();
    
    const query = `
      WITH hourly_stats AS (
        SELECT 
          strftime('%H', created_at) as hour,
          COUNT(*) as comment_count,
          AVG(sentiment_score) as avg_sentiment,
          COUNT(DISTINCT username) as unique_users
        FROM comments
        WHERE platform = ? AND content_url = ?
        GROUP BY hour
      ),
      daily_stats AS (
        SELECT 
          strftime('%w', created_at) as day_of_week,
          COUNT(*) as comment_count,
          AVG(sentiment_score) as avg_sentiment,
          COUNT(DISTINCT username) as unique_users
        FROM comments
        WHERE platform = ? AND content_url = ?
        GROUP BY day_of_week
      )
      SELECT 
        'hourly' as pattern_type,
        hour as time_unit,
        comment_count,
        avg_sentiment,
        unique_users
      FROM hourly_stats
      UNION ALL
      SELECT 
        'daily' as pattern_type,
        day_of_week as time_unit,
        comment_count,
        avg_sentiment,
        unique_users
      FROM daily_stats
      ORDER BY pattern_type, time_unit
    `;

    const patterns = await db.all(query, [platform, url, platform, url]);
    
    // Process and organize the data
    const hourlyPatterns = patterns
      .filter(p => p.pattern_type === 'hourly')
      .map(p => ({
        hour: parseInt(p.time_unit),
        metrics: {
          comment_count: p.comment_count,
          average_sentiment: parseFloat(p.avg_sentiment.toFixed(2)),
          unique_users: p.unique_users
        }
      }));

    const dailyPatterns = patterns
      .filter(p => p.pattern_type === 'daily')
      .map(p => ({
        day: this.getDayName(parseInt(p.time_unit)),
        metrics: {
          comment_count: p.comment_count,
          average_sentiment: parseFloat(p.avg_sentiment.toFixed(2)),
          unique_users: p.unique_users
        }
      }));

    return {
      hourly_patterns: hourlyPatterns,
      daily_patterns: dailyPatterns,
      peak_activity: this.calculatePeakActivity(hourlyPatterns),
      engagement_summary: this.calculateEngagementSummary(patterns)
    };
  }

  static getDayName(dayNum) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNum];
  }

  static calculatePeakActivity(hourlyPatterns) {
    const sorted = [...hourlyPatterns].sort((a, b) => b.metrics.comment_count - a.metrics.comment_count);
    return {
      peak_hours: sorted.slice(0, 3).map(p => p.hour),
      peak_engagement: {
        hour: sorted[0].hour,
        metrics: sorted[0].metrics
      }
    };
  }

  static calculateEngagementSummary(patterns) {
    const totalComments = patterns.reduce((sum, p) => sum + p.comment_count, 0);
    const totalUsers = patterns.reduce((sum, p) => sum + p.unique_users, 0);
    const avgSentiment = patterns.reduce((sum, p) => sum + p.avg_sentiment, 0) / patterns.length;

    return {
      total_engagement: totalComments,
      average_users_per_period: Math.round(totalUsers / patterns.length),
      overall_sentiment: parseFloat(avgSentiment.toFixed(2))
    };
  }

  static async getKeywordAnalysis(url, platform) {
    const db = await getDatabase();
    
    const query = `
      WITH RECURSIVE
      split(word, str) AS (
        SELECT '', comment_text || ' '
        FROM comments
        WHERE platform = ? AND content_url = ?
        UNION ALL
        SELECT
          substr(str, 0, instr(str, ' ')),
          substr(str, instr(str, ' ')+1)
        FROM split WHERE str!=''
      )
      SELECT 
        lower(word) as keyword,
        COUNT(*) as frequency,
        AVG(c.sentiment_score) as avg_sentiment
      FROM split
      JOIN comments c ON split.str LIKE '%' || word || '%'
      WHERE 
        word != '' 
        AND length(word) > 3
        AND word NOT IN ('this', 'that', 'with', 'from', 'what', 'when', 'where', 'which')
      GROUP BY lower(word)
      HAVING frequency > 1
      ORDER BY frequency DESC
      LIMIT 50
    `;

    const keywords = await db.all(query, [platform, url]);
    
    return {
      top_keywords: keywords.map(k => ({
        word: k.keyword,
        frequency: k.frequency,
        sentiment: parseFloat(k.avg_sentiment.toFixed(2))
      })),
      sentiment_analysis: this.analyzeKeywordSentiments(keywords)
    };
  }

  static analyzeKeywordSentiments(keywords) {
    const positiveSentiment = keywords
      .filter(k => k.avg_sentiment > 0)
      .sort((a, b) => b.avg_sentiment - a.avg_sentiment)
      .slice(0, 10)
      .map(k => ({
        word: k.keyword,
        sentiment_score: parseFloat(k.avg_sentiment.toFixed(2))
      }));

    const negativeSentiment = keywords
      .filter(k => k.avg_sentiment < 0)
      .sort((a, b) => a.avg_sentiment - b.avg_sentiment)
      .slice(0, 10)
      .map(k => ({
        word: k.keyword,
        sentiment_score: parseFloat(k.avg_sentiment.toFixed(2))
      }));

    return {
      most_positive_keywords: positiveSentiment,
      most_negative_keywords: negativeSentiment
    };
  }
}
