import Sentiment from 'sentiment';
import { SENTIMENT_LABELS } from '../config/constants.js';
import { logger } from '../config/logger.js';

export class SentimentService {
  constructor() {
    this.sentiment = new Sentiment();
    
    // Register custom vocabulary for social media context
    this.sentiment.registerLanguage('social', {
      // Social media specific words and emoji scores
      labels: {
        'lit': 2,
        'fire': 2,
        'goat': 3,
        'W': 2,
        'based': 2,
        'no cap': 2,
        'bussin': 2,
        'valid': 1,
        'clean': 1,
        'hard': 1,
        'goes hard': 2,
        'W rizz': 2,
        'peak': 2,
        'elite': 2,
        'L': -2,
        'mid': -1,
        'ratio': -1,
        'cap': -1,
        'cringe': -2,
        'trash': -2,
        'dead': -1,
        'L rizz': -2,
        'wack': -2,
        // Emojis
        '🔥': 2,
        '💯': 2,
        '👍': 1,
        '👎': -1,
        '❤️': 2,
        '😊': 2,
        '😢': -1,
        '😡': -2,
        '🤮': -3,
        '💀': -1
      }
    });
  }

  analyzeSentiment(text) {
    try {
      logger.debug('Starting sentiment analysis', { textLength: text.length });
      
      const result = this.sentiment.analyze(text);
      const normalizedScore = this.calculateNormalizedScore(result);
      const label = this.getSentimentLabel(normalizedScore);
      
      const analysis = {
        sentiment_score: normalizedScore,
        sentiment_label: label,
        details: {
          raw_score: result.score,
          comparative: result.comparative,
          positive_words: result.positive,
          negative_words: result.negative,
          word_count: result.tokens.length,
          tokens: result.tokens
        }
      };

      logger.debug('Sentiment analysis completed', analysis);
      return analysis;
    } catch (error) {
      logger.error('Error in sentiment analysis:', error);
      return this.getNeutralSentiment(error.message);
    }
  }

  calculateNormalizedScore(result) {
    const maxScore = Math.max(result.tokens.length * 3, 1);
    return result.score / maxScore;
  }

  getSentimentLabel(score) {
    if (score > 0.05) return SENTIMENT_LABELS.POSITIVE;
    if (score < -0.05) return SENTIMENT_LABELS.NEGATIVE;
    return SENTIMENT_LABELS.NEUTRAL;
  }

  getNeutralSentiment(errorMessage) {
    return {
      sentiment_score: 0,
      sentiment_label: SENTIMENT_LABELS.NEUTRAL,
      details: {
        raw_score: 0,
        comparative: 0,
        positive_words: [],
        negative_words: [],
        word_count: 0,
        error: errorMessage
      }
    };
  }

  analyzeBatch(comments) {
    logger.info(`Analyzing sentiment for ${comments.length} comments in batch`);
    return comments.map(comment => ({
      ...comment,
      ...this.analyzeSentiment(comment.comment_text)
    }));
  }

  getAggregateSentiment(comments) {
    const analyses = this.analyzeBatch(comments);
    
    const totalScore = analyses.reduce((sum, analysis) => sum + analysis.sentiment_score, 0);
    const avgScore = totalScore / analyses.length;
    
    const distribution = {
      positive: analyses.filter(a => a.sentiment_label === SENTIMENT_LABELS.POSITIVE).length / analyses.length,
      neutral: analyses.filter(a => a.sentiment_label === SENTIMENT_LABELS.NEUTRAL).length / analyses.length,
      negative: analyses.filter(a => a.sentiment_label === SENTIMENT_LABELS.NEGATIVE).length / analyses.length
    };

    const wordStats = this.calculateWordStats(analyses);
    
    return {
      average_score: avgScore,
      distribution,
      word_stats: wordStats,
      summary: {
        dominant_sentiment: this.getSentimentLabel(avgScore),
        confidence: Math.abs(avgScore) * 100,
        sentiment_strength: this.getSentimentStrength(avgScore),
        consensus: this.getConsensus(distribution)
      }
    };
  }

  calculateWordStats(analyses) {
    const positiveWords = new Map();
    const negativeWords = new Map();

    analyses.forEach(analysis => {
      analysis.details.positive_words.forEach(word => {
        positiveWords.set(word, (positiveWords.get(word) || 0) + 1);
      });
      analysis.details.negative_words.forEach(word => {
        negativeWords.set(word, (negativeWords.get(word) || 0) + 1);
      });
    });

    return {
      most_common_positive: Array.from(positiveWords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      most_common_negative: Array.from(negativeWords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }

  getSentimentStrength(score) {
    const abs = Math.abs(score);
    if (abs > 0.6) return 'Strong';
    if (abs > 0.3) return 'Moderate';
    return 'Weak';
  }

  getConsensus(distribution) {
    const max = Math.max(distribution.positive, distribution.neutral, distribution.negative);
    if (max > 0.6) return 'High';
    if (max > 0.4) return 'Moderate';
    return 'Mixed';
  }
}