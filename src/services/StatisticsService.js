import { Statistics } from '../models/Statistics.js';
import { CustomError } from '../utils/CustomError.js';

export class StatisticsService {
  async getStats(url, platform, startDate = null, endDate = null) {
    try {
      const stats = await Statistics.getCommentStats(url, platform, startDate, endDate);
      
      return {
        overall: {
          total_comments: stats.total_comments,
          average_sentiment: parseFloat(stats.average_sentiment.toFixed(2)),
          sentiment_distribution: {
            positive: parseFloat(stats.sentiment_distribution.positive.toFixed(2)),
            neutral: parseFloat(stats.sentiment_distribution.neutral.toFixed(2)),
            negative: parseFloat(stats.sentiment_distribution.negative.toFixed(2))
          }
        },
        details: {
          positive_count: stats.positive_count,
          neutral_count: stats.neutral_count,
          negative_count: stats.negative_count
        }
      };
    } catch (error) {
      throw new CustomError('Failed to fetch statistics', 500);
    }
  }

  async getTimeseriesStats(url, platform, startDate, endDate) {
    try {
      const timeseriesData = await Statistics.getTimeSeriesData(url, platform, startDate, endDate);
      
      return timeseriesData.map(data => ({
        date: data.date,
        metrics: {
          comment_count: data.comment_count,
          average_sentiment: parseFloat(data.average_sentiment.toFixed(2)),
          sentiment_breakdown: {
            positive: data.positive_count,
            neutral: data.neutral_count,
            negative: data.negative_count
          }
        }
      }));
    } catch (error) {
      throw new CustomError('Failed to fetch timeseries data', 500);
    }
  }

  async getPlatformOverview() {
    try {
      const platformStats = await Statistics.getPlatformStats();
      
      return platformStats.map(stat => ({
        platform: stat.platform,
        metrics: {
          total_comments: stat.total_comments,
          average_sentiment: parseFloat(stat.average_sentiment.toFixed(2)),
          sentiment_breakdown: {
            positive: stat.positive_count,
            neutral: stat.neutral_count,
            negative: stat.negative_count
          }
        }
      }));
    } catch (error) {
      throw new CustomError('Failed to fetch platform overview', 500);
    }
  }

  async getSentimentTrends(startDate, endDate) {
    try {
      const trends = await Statistics.getSentimentTrends(startDate, endDate);
      return {
        period: {
          start: startDate,
          end: endDate
        },
        trends: trends.map(trend => ({
          date: trend.date,
          average_sentiment: parseFloat(trend.average_sentiment.toFixed(2)),
          dominant_sentiment: trend.dominant_sentiment
        }))
      };
    } catch (error) {
      throw new CustomError('Failed to fetch sentiment trends', 500);
    }
  }

  async getEngagementMetrics(url, platform) {
    try {
      const metrics = await Statistics.getEngagementMetrics(url, platform);
      return {
        comment_frequency: {
          hourly: metrics.hourly_frequency,
          daily: metrics.daily_frequency,
          weekly: metrics.weekly_frequency
        },
        user_engagement: {
          unique_users: metrics.unique_users,
          repeat_commenters: metrics.repeat_commenters,
          average_comments_per_user: parseFloat(metrics.avg_comments_per_user.toFixed(2))
        },
        temporal_patterns: {
          peak_hours: metrics.peak_hours,
          low_activity_hours: metrics.low_activity_hours
        }
      };
    } catch (error) {
      throw new CustomError('Failed to fetch engagement metrics', 500);
    }
  }
  async getActivityPatterns(url, platform) {
    try {
      const patterns = await Statistics.getActivityPatterns(url, platform);
      return {
        temporal_patterns: {
          hourly: patterns.hourly_patterns,
          daily: patterns.daily_patterns
        },
        peak_activity: patterns.peak_activity,
        engagement_summary: patterns.engagement_summary
      };
    } catch (error) {
      throw new CustomError('Failed to fetch activity patterns', 500);
    }
  }

  async getKeywordAnalysis(url, platform) {
    try {
      const analysis = await Statistics.getKeywordAnalysis(url, platform);
      return {
        keyword_insights: {
          most_frequent: analysis.top_keywords.slice(0, 10),
          sentiment_analysis: analysis.sentiment_analysis
        },
        frequency_distribution: analysis.top_keywords.reduce((acc, kw) => {
          acc[kw.word] = kw.frequency;
          return acc;
        }, {})
      };
    } catch (error) {
      throw new CustomError('Failed to analyze keywords', 500);
    }
  }
}
