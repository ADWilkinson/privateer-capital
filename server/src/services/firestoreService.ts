import * as admin from "firebase-admin";
import { Decimal } from "decimal.js";
import { logger } from "../utils/logger";

/**
 * Type definitions to improve code clarity
 */
export interface ApiErrorData {
  timestamp: Date;
  operation: string;
  error: string;
  attempts?: number;
  isRateLimit?: boolean;
  details?: string;
}

export interface CleanupThresholds {
  botEvents: number;
  trades: number;
  correlationPairs: number;
  priceSnapshots?: number;
}

export interface StrategyParams {
  tradeSizePercent: number;
  maxPositions: number;
  correlationThreshold: number;
  zScoreThreshold: number;
  maxPortfolioAllocation: number;
}

export interface CleanupResult {
  botEventsDeleted: number;
  tradesDeleted: number;
  correlationPairsDeleted: number;
  priceSnapshotsDeleted: number;
}

export interface PositionData {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: Decimal;
  entryPrice: Decimal;
  leverage: number;
  status: string;
  correlatedPair?: {
    symbol: string;
    correlation: number;
  };
  stopLoss?: Decimal;
  takeProfit?: Decimal;
}

export interface PriceDataPoint {
  symbol: string;
  timestamp: number;
  price: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CorrelatedPairData {
  pairA: string;
  pairB: string;
  correlation: number;
  cointegrated: boolean;
  regressionCoefficient: number;
  spreadMean: number | null;
  spreadStd: number | null;
  spreadZScore: number | null;
  halfLife: number | null;
  pValue?: number | null;
  timestamp: number;
}

/**
 * Handles all interactions with Firebase Firestore
 */
export class FirestoreService {
  private db: FirebaseFirestore.Firestore;

  // Collection names as constants to avoid typos and improve maintainability
  private readonly COLLECTIONS = {
    API_ERRORS: "apiErrors",
    TRADES: "trades",
    ORDERS: "orders",
    POSITIONS: "positions",
    CORRELATED_PAIRS: "correlatedPairs",
    ACCOUNT_METRICS: "accountMetrics",
    BOT_EVENTS: "botEvents",
    PRICE_SNAPSHOTS: "priceSnapshots",
    PAIR_STATISTICS: "pairStatistics",
    STRATEGY_PARAMS: "strategyParams",
  };

  // Batch operation limits
  private readonly MAX_BATCH_OPERATIONS = 450; // Safe margin below Firestore's 500 limit

  constructor() {
    if (!admin.apps.length) {
      // Firebase App is already initialized in index.ts, we shouldn't initialize it again
      logger.error("Firebase Admin SDK was not initialized before FirestoreService");
      throw new Error("Firebase Admin SDK was not initialized before FirestoreService");
    }

    this.db = admin.firestore();
  }

  /**
   * Create a new batch write operation
   */
  createBatch(): FirebaseFirestore.WriteBatch {
    return this.db.batch();
  }

  /**
   * Get reference to a collection
   */
  getCollection(collectionName: string): FirebaseFirestore.CollectionReference {
    return this.db.collection(collectionName);
  }

  /**
   * Create a Firestore array union field value
   */
  createFieldArrayUnion(value: any): FirebaseFirestore.FieldValue {
    return admin.firestore.FieldValue.arrayUnion(value);
  }

  /**
   * Create a Firestore timestamp
   */
  createTimestamp(): FirebaseFirestore.FieldValue {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  /**
   * Log API errors for monitoring
   * @param errorData Error data to log
   * @returns ID of the created document or empty string on error
   */
  async logApiError(errorData: ApiErrorData): Promise<string> {
    try {
      const apiErrorsCollection = this.db.collection(this.COLLECTIONS.API_ERRORS);

      // Add the error to Firestore
      const docRef = await apiErrorsCollection.add({
        timestamp: errorData.timestamp,
        operation: errorData.operation,
        error: errorData.error,
        attempts: errorData.attempts || 1,
        isRateLimit: errorData.isRateLimit || false,
        resolved: false,
        details: errorData.details,
      });

      logger.info(`Logged API error to Firestore with ID: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      // Don't throw here to avoid cascading errors
      logger.error(`Failed to log API error to Firestore: ${error instanceof Error ? error.message : String(error)}`);
      return "";
    }
  }

  /**
   * Create or update a trade record
   * @param tradeId ID of the trade
   * @param tradeData Trade data to store
   */
  async createTrade(tradeId: string, tradeData: Record<string, unknown>): Promise<void> {
    try {
      await this.db
        .collection(this.COLLECTIONS.TRADES)
        .doc(tradeId)
        .set({
          ...tradeData,
          updatedAt: this.createTimestamp(),
        });
    } catch (error) {
      logger.error(`Error creating trade ${tradeId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing trade
   * @param tradeId ID of the trade to update
   * @param updateData Data to update
   */
  async updateTrade(tradeId: string, updateData: Record<string, unknown>): Promise<void> {
    try {
      await this.db
        .collection(this.COLLECTIONS.TRADES)
        .doc(tradeId)
        .update({
          ...updateData,
          updatedAt: this.createTimestamp(),
        });
    } catch (error) {
      logger.error(`Error updating trade ${tradeId}:`, error);
      throw error;
    }
  }

  /**
   * Update or create a correlated pair record
   * @param pairId ID of the pair (typically in format "SYMBOL1_SYMBOL2")
   * @param data Correlated pair data to store
   */
  async updateCorrelatedPair(pairId: string, data: Partial<CorrelatedPairData>): Promise<void> {
    try {
      await this.db.collection(this.COLLECTIONS.CORRELATED_PAIRS).doc(pairId).set(
        {
          pairA: data.pairA,
          pairB: data.pairB,
          correlation: data.correlation,
          cointegrated: data.cointegrated,
          regressionCoefficient: data.regressionCoefficient,
          spreadMean: data.spreadMean,
          spreadStd: data.spreadStd,
          halfLife: data.halfLife,
          timestamp: data.timestamp,
        },
        { merge: true }
      );
    } catch (error) {
      logger.error(`Error updating correlated pair ${pairId}:`, error);
      throw error;
    }
  }

  /**
   * Create order record
   * @param orderData Order data to store
   */
  async createOrder(orderData: Record<string, unknown>): Promise<string> {
    try {
      const docRef = await this.db.collection(this.COLLECTIONS.ORDERS).add({
        ...orderData,
        createdAt: this.createTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      logger.error("Error creating order:", error);
      throw error;
    }
  }

  /**
   * Update account metrics
   * @param metricsData Metrics data to store
   */
  async updateAccountMetrics(metricsData: Record<string, unknown>): Promise<void> {
    try {
      const batch = this.createBatch();

      // Save current metrics as a new document
      const newDocRef = this.db.collection(this.COLLECTIONS.ACCOUNT_METRICS).doc();
      batch.set(newDocRef, {
        ...metricsData,
        createdAt: this.createTimestamp(),
      });

      // Update latest record
      const latestDocRef = this.db.collection(this.COLLECTIONS.ACCOUNT_METRICS).doc("latest");
      batch.set(latestDocRef, {
        ...metricsData,
        updatedAt: this.createTimestamp(),
      });

      await batch.commit();
    } catch (error) {
      logger.error("Error updating account metrics:", error);
      throw error;
    }
  }

  /**
   * Log an event to Firestore
   */
  async logEvent(eventType: string, data?: Record<string, any>): Promise<void> {
    try {
      // Filter out undefined values from the data
      const filteredData = Object.entries(data || {}).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);

      await this.db.collection(this.COLLECTIONS.BOT_EVENTS).add({
        type: eventType, // Add type field for consistency
        eventType, // Keep original field for backward compatibility
        data: filteredData,
        timestamp: Date.now(),
        createdAt: this.createTimestamp(),
      });
    } catch (error) {
      logger.error(`Error logging event ${eventType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  /**
   * Get bot events with optional filtering
   * @param options Options for retrieving events
   * @param options.limit Maximum number of events to return
   * @param options.eventFilter Optional event type to filter by
   * @param options.startTime Optional timestamp to filter events after
   * @param options.endTime Optional timestamp to filter events before
   * @returns Array of bot events
   */
  async getBotEvents(options: {
    limit?: number;
    eventFilter?: string;
    startTime?: number;
    endTime?: number;
  } = {}): Promise<any[]> {
    try {
      const { limit = 20, eventFilter, startTime, endTime } = options;
      
      // Check if collection exists first to prevent errors on empty database
      const collections = await this.db.listCollections();
      const collectionExists = collections.some(col => col.id === this.COLLECTIONS.BOT_EVENTS);
      
      if (!collectionExists) {
        logger.warn(`Collection ${this.COLLECTIONS.BOT_EVENTS} does not exist yet`);
        return [];
      }
      
      let query: FirebaseFirestore.Query = this.db.collection(this.COLLECTIONS.BOT_EVENTS);
      
      // For debugging purposes, log the query we're about to run
      logger.info(`Running getBotEvents query with: limit=${limit}, eventFilter=${eventFilter || 'none'}`);
      
      // Check if we have any documents in this collection
      const checkSnapshot = await this.db.collection(this.COLLECTIONS.BOT_EVENTS).limit(1).get();
      if (checkSnapshot.empty) {
        logger.warn(`Collection ${this.COLLECTIONS.BOT_EVENTS} exists but is empty`);
        return [];
      }
      
      // Apply filters conditionally
      if (eventFilter) {
        // Try both 'type' and 'eventType' fields for backward compatibility
        try {
          query = query.where("type", "==", eventFilter);
        } catch (error) {
          logger.warn(`Error using 'type' field, trying 'eventType': ${error}`);
          query = query.where("eventType", "==", eventFilter);
        }
      }
      
      // Apply timestamp ordering (required for Firestore queries)
      query = query.orderBy("timestamp", "desc");
      
      // Apply limit
      query = query.limit(limit);
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        logger.info(`No events found with filter: ${eventFilter || 'none'}`);
        return [];
      }
      
      logger.info(`Found ${snapshot.docs.length} events with filter: ${eventFilter || 'none'}`);
      
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      logger.error("Error getting bot events:", error);
      throw error;
    }
  }

  /**
   * Get all trades
   * @returns Array of trade records
   */
  async getAllTrades(): Promise<Record<string, unknown>[]> {
    try {
      const snapshot = await this.db.collection(this.COLLECTIONS.TRADES).get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      logger.error("Error getting all trades:", error);
      throw error;
    }
  }

  /**
   * Get active trades
   * @returns Array of active trade records
   */
  async getActiveTrades(): Promise<Record<string, unknown>[]> {
    try {
      const snapshot = await this.db.collection(this.COLLECTIONS.TRADES).where("status", "==", "open").get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      logger.error("Error getting active trades:", error);
      throw error;
    }
  }

  /**
   * Get correlated pairs
   * @returns Array of correlated pair records
   */
  async getCorrelatedPairs(): Promise<CorrelatedPairData[]> {
    try {
      const querySnapshot = await this.getCollection(this.COLLECTIONS.CORRELATED_PAIRS)
        .orderBy("timestamp", "desc")
        .get();

      const pairs: CorrelatedPairData[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as Record<string, unknown>;
        pairs.push({
          pairA: data.pairA as string,
          pairB: data.pairB as string,
          correlation: data.correlation as number,
          cointegrated: data.cointegrated as boolean,
          regressionCoefficient: data.regressionCoefficient as number,
          spreadMean: data.spreadMean as number | null,
          spreadStd: data.spreadStd as number | null,
          spreadZScore: data.spreadZScore as number | null,
          halfLife: data.halfLife as number | null,
          timestamp: data.timestamp as number
        });
      });

      return pairs;
    } catch (error) {
      logger.error("Error getting correlated pairs:", error);
      throw error;
    }
  }

  /**
   * Get recent orders
   * @param limit Maximum number of orders to retrieve
   * @returns Array of recent order records
   */
  async getRecentOrders(limit = 50): Promise<Record<string, unknown>[]> {
    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.ORDERS)
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      logger.error("Error getting recent orders:", error);
      throw error;
    }
  }

  /**
   * Get bot performance metrics
   * @returns Performance metrics record
   */
  async getBotPerformance(): Promise<Record<string, unknown>> {
    try {
      // Get all closed trades
      const tradesSnapshot = await this.db.collection(this.COLLECTIONS.TRADES).where("status", "==", "closed").get();

      const trades = tradesSnapshot.docs.map((doc) => doc.data());

      // Calculate performance metrics
      const totalTrades = trades.length;
      const profitableTrades = trades.filter((trade) => trade.finalPnl > 0).length;
      const unprofitableTrades = trades.filter((trade) => trade.finalPnl <= 0).length;

      const totalPnl = trades.reduce((sum, trade) => sum + (Number(trade.finalPnl) || 0), 0);
      const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;

      // Get latest account metrics
      const metricsDoc = await this.db.collection(this.COLLECTIONS.ACCOUNT_METRICS).doc("latest").get();
      const accountMetrics = metricsDoc.exists ? metricsDoc.data() : {};

      // Get PnL history for chart
      const metricsSnapshot = await this.db
        .collection(this.COLLECTIONS.ACCOUNT_METRICS)
        .orderBy("timestamp", "desc")
        .limit(30)
        .get();

      const pnlHistory = metricsSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            date: data.timestamp,
            value: data.dailyPnl || 0,
            balance: data.totalBalance || 0,
          };
        })
        .reverse();

      return {
        totalTrades,
        profitableTrades,
        unprofitableTrades,
        winRate,
        totalPnl,
        pnlHistory,
        accountMetrics,
      };
    } catch (error) {
      logger.error("Error getting bot performance:", error);
      throw error;
    }
  }

  /**
   * Get all active positions from Firestore
   * @returns Array of active position records
   */
  async getActivePositions(): Promise<PositionData[]> {
    try {
      const positionsRef = this.db.collection(this.COLLECTIONS.POSITIONS);
      const snapshot = await positionsRef.where("status", "==", "open").get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          symbol: data.symbol as string,
          side: data.side as "long" | "short",
          size: new Decimal(data.size),
          entryPrice: new Decimal(data.entryPrice),
          leverage: data.leverage as number,
          status: data.status as string,
          correlatedPair: data.correlatedPair
            ? {
                symbol: data.correlatedPair.symbol as string,
                correlation: data.correlatedPair.correlation as number,
              }
            : undefined,
          stopLoss: data.stopLoss ? new Decimal(data.stopLoss) : undefined,
          takeProfit: data.takeProfit ? new Decimal(data.takeProfit) : undefined,
        };
      });
    } catch (error) {
      logger.error("Error getting active positions:", error);
      throw error;
    }
  }

  /**
   * Get the latest price snapshot for a specific asset
   * @param symbol Asset symbol
   * @returns The latest price snapshot data or null if not found
   */
  async getLatestPriceSnapshot(symbol: string): Promise<PriceDataPoint | null> {
    try {
      const normalizedSymbol = symbol.toUpperCase();

      // Get the latest snapshot
      const snapshotsRef = this.db.collection(this.COLLECTIONS.PRICE_SNAPSHOTS);
      const snapshot = await snapshotsRef
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const latestSnapshot = snapshot.docs[0].data();
      const price = latestSnapshot.prices[normalizedSymbol];

      if (price === undefined) {
        logger.warn(`No price data found for ${normalizedSymbol} in the latest snapshot`);
        return null;
      }

      return {
        symbol: normalizedSymbol,
        timestamp: latestSnapshot.timestamp,
        price
      };
    } catch (error) {
      logger.error(`Error getting latest price snapshot for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get historical price data for a specific asset within a time range
   * @param symbol Asset symbol
   * @param startTime Start timestamp in milliseconds
   * @returns Array of OHLCV data points
   */
  async getHistoricalPriceData(symbol: string, startTime: number): Promise<OHLCV[]> {
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const snapshotsRef = this.db.collection(this.COLLECTIONS.PRICE_SNAPSHOTS);
      const snapshots = await snapshotsRef
        .where("timestamp", ">=", startTime)
        .orderBy("timestamp", "asc")
        .get();

      if (snapshots.empty) {
        logger.warn(`No price snapshots found for ${normalizedSymbol} after ${startTime}`);
        return [];
      }

      const pricePoints: { timestamp: number; price: number }[] = [];

      snapshots.forEach((doc) => {
        const data = doc.data();
        const price = data.prices[normalizedSymbol];
        
        if (price !== undefined) {
          pricePoints.push({
            timestamp: data.timestamp,
            price
          });
        }
      });

      if (pricePoints.length === 0) {
        logger.warn(`No price data found for ${normalizedSymbol} in the available snapshots`);
        return [];
      }

      // Group by day for OHLC calculation and create candles
      const pricesByDay = this.groupPricePointsByDay(pricePoints);
      return this.createOHLCVCandles(pricesByDay);
    } catch (error) {
      logger.error(`Error getting historical price data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get correlation data for a pair of assets
   * @param pairA First asset symbol
   * @param pairB Second asset symbol
   * @returns Correlation data record or null if not found
   */
  async getCorrelationData(pairA: string, pairB: string): Promise<Record<string, unknown> | null> {
    try {
      const pairId = `${pairA}_${pairB}`;
      const doc = await this.db.collection(this.COLLECTIONS.CORRELATED_PAIRS).doc(pairId).get();

      if (!doc.exists) {
        // Try the reverse pair
        const reversePairId = `${pairB}_${pairA}`;
        const reverseDoc = await this.db.collection(this.COLLECTIONS.CORRELATED_PAIRS).doc(reversePairId).get();

        if (!reverseDoc.exists) {
          return null;
        }

        return {
          id: reversePairId,
          ...reverseDoc.data(),
        };
      }

      return {
        id: pairId,
        ...doc.data(),
      };
    } catch (error) {
      logger.error(`Error getting correlation data for ${pairA}_${pairB}:`, error);
      return null;
    }
  }

  /**
   * Get a specific correlated pair by its ID (e.g., 'ASSET1_ASSET2')
   * @param pairId ID of the pair to retrieve
   * @returns Correlated pair record or null if not found
   */
  async getCorrelatedPairById(pairId: string): Promise<Record<string, unknown> | null> {
    try {
      const docRef = this.db.collection(this.COLLECTIONS.CORRELATED_PAIRS).doc(pairId);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        logger.warn(`Correlated pair with ID ${pairId} not found in Firestore.`);
        return null;
      }
    } catch (error) {
      logger.error(`Error getting correlated pair by ID ${pairId}:`, error);
      throw error;
    }
  }

  // updateCorrelationData method removed - use updateCorrelatedPair instead

  /**
   * Update or create pair statistics record
   * @param pairId ID of the pair
   * @param statsData Statistics data to store
   */
  async updatePairStatistics(pairId: string, statsData: Record<string, unknown>): Promise<void> {
    try {
      await this.db
        .collection(this.COLLECTIONS.PAIR_STATISTICS)
        .doc(pairId)
        .set(
          {
            ...statsData,
            updatedAt: this.createTimestamp(),
          },
          { merge: true }
        );
    } catch (error) {
      logger.error(`Error updating pair statistics for ${pairId}:`, error);
      throw error;
    }
  }

  /**
   * Store multiple correlated pairs in Firestore efficiently using batch operations
   * @param pairs Array of correlated pairs to store
   */
  async storeCorrelatedPairs(pairs: CorrelatedPairData[]): Promise<void> {
    try {
      const batch = this.db.batch();

      for (const pair of pairs) {
        const pairId = `${pair.pairA}_${pair.pairB}`;
        const pairRef = this.db.collection(this.COLLECTIONS.CORRELATED_PAIRS).doc(pairId);

        batch.set(pairRef, {
          pairA: pair.pairA,
          pairB: pair.pairB,
          correlation: pair.correlation,
          cointegrated: pair.cointegrated,
          regressionCoefficient: pair.regressionCoefficient,
          spreadMean: pair.spreadMean,
          spreadStd: pair.spreadStd,
          halfLife: pair.halfLife,
          timestamp: pair.timestamp,
        });
      }

      await batch.commit();
      logger.info(`Stored ${pairs.length} correlated pairs in Firestore`);
    } catch (error) {
      logger.error("Error storing correlated pairs:", error);
    }
  }

  /**
   * Process documents for deletion in batches
   * @param querySnapshot Firestore query snapshot containing documents to delete
   * @param batch Current write batch
   * @param operationCount Current count of operations in the batch
   * @returns Object with updated batch and operation count
   */
  private async processBatchDeletes(
    querySnapshot: FirebaseFirestore.QuerySnapshot,
    batch: FirebaseFirestore.WriteBatch,
    operationCount: number
  ): Promise<{
    batch: FirebaseFirestore.WriteBatch;
    operationCount: number;
    deletedCount: number;
  }> {
    let currentBatch = batch;
    let currentCount = operationCount;
    let deletedCount = 0;

    for (const doc of querySnapshot.docs) {
      currentBatch.delete(doc.ref);
      currentCount++;
      deletedCount++;

      // If we're approaching the batch limit, commit and start a new batch
      if (currentCount >= this.MAX_BATCH_OPERATIONS) {
        await currentBatch.commit();
        currentBatch = this.createBatch();
        currentCount = 0;
      }
    }

    return { batch: currentBatch, operationCount: currentCount, deletedCount };
  }

  /**
   * Clean up old data from various collections
   * @param thresholds Object containing cleanup thresholds in milliseconds
   * @returns Object with count of deleted documents for each collection
   */
  async cleanupOldData(thresholds: CleanupThresholds): Promise<CleanupResult> {
    let batch = this.createBatch();
    let operationCount = 0;
    let botEventsDeleted = 0;
    let tradesDeleted = 0;
    let correlationPairsDeleted = 0;
    let priceSnapshotsDeleted = 0;

    try {
      // 1. Clean up botEvents
      const botEventsRef = this.db.collection(this.COLLECTIONS.BOT_EVENTS);
      const botEventsQuery = botEventsRef.where("timestamp", "<", Date.now() - thresholds.botEvents);
      const botEventsSnapshot = await botEventsQuery.get();

      const botEventsResult = await this.processBatchDeletes(botEventsSnapshot, batch, operationCount);
      batch = botEventsResult.batch;
      operationCount = botEventsResult.operationCount;
      botEventsDeleted = botEventsResult.deletedCount;

      // 2. Clean up trades
      const tradesRef = this.db.collection(this.COLLECTIONS.TRADES);
      const tradesQuery = tradesRef.where("timestamp", "<", Date.now() - thresholds.trades);
      const tradesSnapshot = await tradesQuery.get();

      const tradesResult = await this.processBatchDeletes(tradesSnapshot, batch, operationCount);
      batch = tradesResult.batch;
      operationCount = tradesResult.operationCount;
      tradesDeleted = tradesResult.deletedCount;

      // 3. Clean up correlationPairs
      const correlationPairsRef = this.db.collection(this.COLLECTIONS.CORRELATED_PAIRS);
      const correlationPairsQuery = correlationPairsRef.where(
        "timestamp",
        "<",
        Date.now() - thresholds.correlationPairs
      );
      const correlationPairsSnapshot = await correlationPairsQuery.get();

      const correlationPairsResult = await this.processBatchDeletes(correlationPairsSnapshot, batch, operationCount);
      batch = correlationPairsResult.batch;
      operationCount = correlationPairsResult.operationCount;
      correlationPairsDeleted = correlationPairsResult.deletedCount;

      // 4. Clean up price snapshots
      const priceSnapshotsRetention = thresholds.priceSnapshots || 90 * 24 * 60 * 60 * 1000;
      const timestampThreshold = Date.now() - priceSnapshotsRetention;

      const priceSnapshotsRef = this.db.collection(this.COLLECTIONS.PRICE_SNAPSHOTS);
      const priceSnapshotsQuery = priceSnapshotsRef.where("timestamp", "<", timestampThreshold).limit(500);

      // Process price snapshots in chunks due to potentially large number of documents
      let priceSnapshotsSnapshot = await priceSnapshotsQuery.get();
      while (!priceSnapshotsSnapshot.empty) {
        const snapshotsResult = await this.processBatchDeletes(priceSnapshotsSnapshot, batch, operationCount);
        batch = snapshotsResult.batch;
        operationCount = snapshotsResult.operationCount;
        priceSnapshotsDeleted += snapshotsResult.deletedCount;

        // If we deleted a full batch, there might be more to process
        if (priceSnapshotsSnapshot.docs.length === 500) {
          // Commit current batch to avoid hitting limits
          await batch.commit();
          batch = this.createBatch();
          operationCount = 0;

          // Get next chunk
          priceSnapshotsSnapshot = await priceSnapshotsQuery.get();
        } else {
          break;
        }
      }

      // Execute final batch if there are pending operations
      if (operationCount > 0) {
        await batch.commit();
      }

      logger.info(
        `Data cleanup completed - Deleted ${botEventsDeleted} bot events, ${tradesDeleted} trades, ${correlationPairsDeleted} correlation pairs, and ${priceSnapshotsDeleted} price snapshots`
      );

      return {
        botEventsDeleted,
        tradesDeleted,
        correlationPairsDeleted,
        priceSnapshotsDeleted,
      };
    } catch (error) {
      logger.error("Error during data cleanup:", error);

      // Try to commit any pending operations
      if (operationCount > 0) {
        try {
          await batch.commit();
        } catch (commitError) {
          logger.error("Error committing cleanup batch:", commitError);
        }
      }

      throw error;
    }
  }

  /**
   * Get all pending trades (status: 'open')
   * @returns Array of pending trade documents
   */
  async getPendingTrades(): Promise<any[]> {
    try {
      const tradesRef = this.db.collection(this.COLLECTIONS.TRADES);
      const querySnapshot = await tradesRef
        .where('status', '==', 'open')
        .get();

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error('Error getting pending trades:', error);
      throw error;
    }
  }
  
  /**
   * Get a list of available collections to help with debugging
   * @returns Array of collection names that exist
   */
  async getTradableCollections(): Promise<string[]> {
    try {
      logger.info("Checking Firestore for available collections");
      const collections = await this.db.listCollections();
      
      // Get the names of all collections
      const collectionNames = collections.map(col => col.id);
      
      // Check if our trades collection exists
      const hasTradesCollection = collectionNames.includes(this.COLLECTIONS.TRADES);
      logger.info(`Trades collection exists: ${hasTradesCollection}`);
      
      // If trades collection exists, get a sample of documents to check structure
      if (hasTradesCollection) {
        const tradesSnapshot = await this.db.collection(this.COLLECTIONS.TRADES).limit(1).get();
        if (!tradesSnapshot.empty) {
          const sampleTrade = tradesSnapshot.docs[0].data();
          logger.info(`Sample trade structure: ${JSON.stringify(Object.keys(sampleTrade))}`);
        } else {
          logger.info("Trades collection exists but is empty");
        }
      }
      
      return collectionNames;
    } catch (error) {
      logger.error("Error listing Firestore collections:", error);
      return [];
    }
  }
  
  /**
   * Get strategy parameters from Firestore
   * @returns Current strategy parameters or default values if not found
   */
  async getStrategyParams(): Promise<StrategyParams> {
    try {
      const docRef = this.db.collection(this.COLLECTIONS.STRATEGY_PARAMS).doc('current');
      const doc = await docRef.get();
      
      if (doc.exists) {
        const data = doc.data() as StrategyParams;
        logger.info('Retrieved strategy parameters from Firestore');
        return data;
      } else {
        // Return default values if no parameters are stored
        logger.info('No strategy parameters found in Firestore, using defaults');
        return {
          tradeSizePercent: 0.25,
          maxPositions: 2,
          correlationThreshold: 0.95,
          zScoreThreshold: 2.5,
          maxPortfolioAllocation: 0.5
        };
      }
    } catch (error) {
      logger.error('Error getting strategy parameters:', error);
      // Return default values on error
      return {
        tradeSizePercent: 0.25,
        maxPositions: 2,
        correlationThreshold: 0.95,
        zScoreThreshold: 2.5,
        maxPortfolioAllocation: 0.5
      };
    }
  }
  
  /**
   * Update strategy parameters in Firestore
   * @param params Updated strategy parameters
   */
  async updateStrategyParams(params: StrategyParams): Promise<void> {
    try {
      const docRef = this.db.collection(this.COLLECTIONS.STRATEGY_PARAMS).doc('current');
      
      await docRef.set({
        tradeSizePercent: params.tradeSizePercent,
        maxPositions: params.maxPositions,
        correlationThreshold: params.correlationThreshold,
        zScoreThreshold: params.zScoreThreshold,
        maxPortfolioAllocation: params.maxPortfolioAllocation,
        updatedAt: this.createTimestamp()
      });
      
      logger.info('Updated strategy parameters in Firestore');
      
      // Log the change as an event
      await this.logEvent('strategy_params_updated', {
        tradeSizePercent: params.tradeSizePercent,
        maxPositions: params.maxPositions,
        correlationThreshold: params.correlationThreshold,
        zScoreThreshold: params.zScoreThreshold,
        maxPortfolioAllocation: params.maxPortfolioAllocation
      });
      
    } catch (error) {
      logger.error('Error updating strategy parameters:', error);
      throw error;
    }
  }

  // normalizeSymbol method removed - use PriceDataService.normalizeSymbol instead

  private groupPricePointsByDay(pricePoints: { timestamp: number; price: number }[]): Record<string, { timestamp: number; price: number }[]> {
    const groupedPoints: Record<string, { timestamp: number; price: number }[]> = {};

    pricePoints.forEach((point) => {
      const date = new Date(point.timestamp);
      const day = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      if (!groupedPoints[day]) {
        groupedPoints[day] = [];
      }

      groupedPoints[day].push(point);
    });

    return groupedPoints;
  }

  private createOHLCVCandles(pricesByDay: Record<string, { timestamp: number; price: number }[]>): OHLCV[] {
    const candles: OHLCV[] = [];

    Object.keys(pricesByDay).forEach((day) => {
      const points = pricesByDay[day];

      const open = points[0].price;
      const high = Math.max(...points.map((point) => point.price));
      const low = Math.min(...points.map((point) => point.price));
      const close = points[points.length - 1].price;
      const volume = 0; // We don't track volume in snapshots

      candles.push({
        timestamp: points[0].timestamp,
        open,
        high,
        low,
        close,
        volume,
      });
    });

    return candles;
  }
}
