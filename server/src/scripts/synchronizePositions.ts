#!/usr/bin/env ts-node
import { HyperliquidExecutor } from "../execution/hyperliquidExecutor";
import { FirestoreService } from "../services/firestoreService";
import { logger } from "../utils/logger";
import { Decimal } from "decimal.js";
import dotenv from "dotenv";
import admin from "firebase-admin";

// Load environment variables
dotenv.config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
});

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    logger.info("Firebase Admin SDK initialized");
  }
} catch (error) {
  logger.error("Error initializing Firebase Admin SDK:", error);
  process.exit(1);
}

/**
 * Utility script to synchronize database position records with exchange positions
 * 
 * This script will:
 * 1. Get all active positions from the exchange
 * 2. Get all active trades from the database
 * 3. Sync both by:
 *    - Creating database records for positions found only on exchange
 *    - Closing database records for positions not found on exchange
 */
async function synchronizePositions(): Promise<void> {
  // Initialize services
  const firestoreService = new FirestoreService();
  const hyperliquidExecutor = new HyperliquidExecutor(firestoreService);
  
  try {
    // Wait for executor to initialize
    logger.info("Initializing Hyperliquid executor");
    await hyperliquidExecutor.initialize();
    
    // Additional wait to ensure full initialization 
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.info("Hyperliquid executor initialized successfully");
    
    // Get all positions directly from the exchange (source of truth)
    logger.info("Fetching all positions from exchange...");
    const exchangePositions = await hyperliquidExecutor.getPositions();
    
    // Filter out tiny positions that might be leftovers
    const significantPositions = exchangePositions.filter(pos => {
      const positionSize = Math.abs(parseFloat(pos.position));
      return positionSize > 0.001; // Ignore very small positions
    });
    
    logger.info(`Found ${significantPositions.length} significant positions on exchange`);
    
    // Log all positions for analysis
    significantPositions.forEach(pos => {
      logger.info(`Exchange position: ${pos.coin}, Size: ${pos.position}, Entry Price: ${pos.entryPx}`);
    });
    
    // Get all active trades from the database
    logger.info("Fetching all active trades from database...");
    const activeTrades = await firestoreService.getActiveTrades();
    logger.info(`Found ${activeTrades.length} active trades in database`);
    
    // Extract symbols from database trades
    const databasePositions = activeTrades.map(trade => trade.symbol as string);
    databasePositions.forEach(symbol => {
      logger.info(`Database position: ${symbol}`);
    });
    
    // Compare exchange positions with database records
    const exchangeSymbols = significantPositions.map(pos => pos.coin);
    const exchangeOnly = exchangeSymbols.filter(symbol => !databasePositions.includes(symbol));
    const databaseOnly = databasePositions.filter(symbol => !exchangeSymbols.includes(symbol));
    
    let syncActions = 0;
    
    // Process mismatches
    if (exchangeOnly.length > 0 || databaseOnly.length > 0) {
      logger.warn("DATABASE-EXCHANGE MISMATCH DETECTED!");
      
      // 1. Create database records for exchange positions not in database
      if (exchangeOnly.length > 0) {
        logger.warn(`Positions on exchange but missing from database: ${exchangeOnly.join(", ")}`);
        logger.info("Creating missing database records for exchange positions...");
        
        for (const symbol of exchangeOnly) {
          const position = significantPositions.find(pos => pos.coin === symbol);
          if (position) {
            const positionVal = parseFloat(position.position);
            const side = positionVal > 0 ? 'long' : 'short';
            const size = Math.abs(positionVal);
            const entryPrice = position.entryPx;
            
            // Generate unique ID for the trade
            const tradeId = `trade_${symbol}_${Date.now()}_reconciled`;
            
            // Add to database
            await firestoreService.createTrade(tradeId, {
              symbol,
              side,
              size: String(size),
              entryPrice,
              leverage: 1,
              status: 'open',
              openedAt: Date.now(),
              orderId: 'exchange_reconciled',
              stopLoss: null,
              takeProfit: null,
              correlatedPair: null
            });
            
            logger.info(`Created database record for ${symbol} ${side} position`);
            
            // Log the reconciliation event
            await firestoreService.logEvent("position_reconciled_added", {
              symbol,
              side,
              size: String(size),
              entryPrice,
              timestamp: Date.now()
            });
            
            syncActions++;
          }
        }
      }
      
      // 2. Close database records for positions not on exchange
      if (databaseOnly.length > 0) {
        logger.warn(`Positions in database but missing from exchange: ${databaseOnly.join(", ")}`);
        logger.info("Marking phantom database records as closed...");
        
        for (const symbol of databaseOnly) {
          const trades = activeTrades.filter(trade => trade.symbol === symbol);
          
          for (const trade of trades) {
            await firestoreService.updateTrade(trade.id as string, {
              status: 'closed',
              closedAt: Date.now(),
              closeReason: 'exchange_mismatch',
              pnl: '0'
            });
            
            logger.info(`Marked phantom trade ${trade.id} (${symbol}) as closed`);
            
            // Log the reconciliation event
            await firestoreService.logEvent("position_reconciled_closed", {
              tradeId: trade.id,
              symbol,
              reason: "not_on_exchange",
              timestamp: Date.now()
            });
            
            syncActions++;
          }
        }
      }
      
      // Log the sync action
      await firestoreService.logEvent("position_sync_completed", {
        exchangePositions: significantPositions.length,
        databasePositions: activeTrades.length,
        exchangeOnly: exchangeOnly.length,
        databaseOnly: databaseOnly.length,
        syncActions,
        timestamp: Date.now()
      });
      
      logger.info(`Synchronization completed. Performed ${syncActions} sync actions.`);
    } else {
      logger.info("Database and exchange positions are already in sync. No action needed.");
    }
    
    // Check if positions are balanced (equal number of shorts and longs)
    const shortPositions = significantPositions.filter(pos => parseFloat(pos.position) < 0);
    const longPositions = significantPositions.filter(pos => parseFloat(pos.position) > 0);
    const isBalanced = longPositions.length === shortPositions.length;
    
    if (!isBalanced) {
      logger.warn(`POSITION IMBALANCE DETECTED: ${longPositions.length} longs vs ${shortPositions.length} shorts`);
      logger.warn("Consider running fixImbalancedPositions.ts to address this issue");
      
      // Log the imbalance for monitoring
      await firestoreService.logEvent("position_imbalance_detected", {
        longCount: longPositions.length,
        shortCount: shortPositions.length,
        totalPositions: significantPositions.length,
        timestamp: Date.now()
      });
    } else {
      logger.info("Position balance check: OK");
    }
    
  } catch (error) {
    logger.error("Error in synchronizePositions script:", error);
    
    // Log the error
    const firestoreService = new FirestoreService();
    await firestoreService.logEvent("position_sync_error", {
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    });
  } finally {
    // Wait a moment for any pending logging
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(0);
  }
}

// Run the script
synchronizePositions();