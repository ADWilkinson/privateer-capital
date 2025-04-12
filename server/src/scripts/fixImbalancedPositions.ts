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

// Parse command line arguments
const args = process.argv.slice(2);
const forceClose = args.includes("--force");

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
 * Utility script to detect and fix imbalanced pair positions
 * 
 * This script will:
 * 1. Get all active positions from the exchange
 * 2. Check if there are any imbalanced pairs (e.g., one side missing)
 * 3. Close all positions and clean up the database if imbalanced pairs are detected
 */
async function fixImbalancedPositions(): Promise<void> {
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
      logger.info(`Position: ${pos.coin}, Size: ${pos.position}, Entry Price: ${pos.entryPx}`);
    });
    
    // Count short and long positions
    const shortPositions = significantPositions.filter(pos => parseFloat(pos.position) < 0);
    const longPositions = significantPositions.filter(pos => parseFloat(pos.position) > 0);
    
    logger.info(`Position count: ${longPositions.length} longs, ${shortPositions.length} shorts`);
    
    // Check database-exchange consistency first
    logger.info("Checking database-exchange consistency...");
    const activeTrades = await firestoreService.getActiveTrades();
    const databasePositions = activeTrades.map(trade => trade.symbol as string);
    
    // Compare exchange positions with database records
    const exchangeSymbols = significantPositions.map(pos => pos.coin);
    const exchangeOnly = exchangeSymbols.filter(symbol => !databasePositions.includes(symbol));
    const databaseOnly = databasePositions.filter(symbol => !exchangeSymbols.includes(symbol));
    
    if (exchangeOnly.length > 0 || databaseOnly.length > 0) {
      logger.warn("DATABASE-EXCHANGE MISMATCH DETECTED!");
      
      if (exchangeOnly.length > 0) {
        logger.warn(`Positions on exchange but missing from database: ${exchangeOnly.join(", ")}`);
        
        // Auto-sync: Create missing database records for exchange positions
        if (forceClose) {
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
            }
          }
        }
      }
      
      if (databaseOnly.length > 0) {
        logger.warn(`Positions in database but missing from exchange: ${databaseOnly.join(", ")}`);
        
        // Auto-sync: Mark phantom database records as closed
        if (forceClose) {
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
            }
          }
        }
      }
    } else {
      logger.info("Database and exchange positions are in sync.");
    }
    
    // Check if positions are balanced (equal number of shorts and longs)
    const isBalanced = longPositions.length === shortPositions.length;
    
    if (!isBalanced) {
      logger.warn(`IMBALANCE DETECTED: ${longPositions.length} longs vs ${shortPositions.length} shorts`);
      
      // Log the specific positions that are imbalanced
      logger.info("Long positions:");
      longPositions.forEach(pos => {
        logger.info(`  ${pos.coin}: ${pos.position}`);
      });
      
      logger.info("Short positions:");
      shortPositions.forEach(pos => {
        logger.info(`  ${pos.coin}: ${pos.position}`);
      });
      
      // Ask for confirmation before proceeding
      const args = process.argv.slice(2);
      const forceClose = args.includes("--force");
      
      if (!forceClose) {
        logger.info("To close all positions and fix the imbalance, run with --force flag");
        return;
      }
      
      // Close all positions
      logger.info("CLOSING ALL POSITIONS TO RESOLVE IMBALANCE");
      
      // Log this critical action in Firestore
      await firestoreService.logEvent("emergency_position_closure", {
        reason: "position_imbalance",
        longCount: longPositions.length,
        shortCount: shortPositions.length,
        totalPositions: significantPositions.length,
        timestamp: Date.now()
      });
      
      if (false) { // Removed dry run option
        // In dry run mode, just log what would happen
        logger.info("DRY RUN MODE - Would close these positions:");
        significantPositions.forEach(position => {
          const { coin, position: positionSize } = position;
          const size = Math.abs(parseFloat(positionSize));
          logger.info(`- Would close ${coin} with size ${size}`);
        });
      } else {
        // Actually close the positions
        for (const position of significantPositions) {
          try {
            const { coin, position: positionSize } = position;
            const size = new Decimal(Math.abs(parseFloat(positionSize)));
            
            logger.info(`Closing position for ${coin} with size ${size}`);
            await hyperliquidExecutor.closePosition(coin, size);
            logger.info(`Successfully closed position for ${coin}`);
            
            // Add a small delay between closures to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logger.error(`Failed to close position ${position.coin}:`, error);
          }
        }
      }
      
      // Verification step
      logger.info("Verifying all positions are closed...");
      const remainingPositions = await hyperliquidExecutor.getPositions();
      const remainingSignificant = remainingPositions.filter(pos => {
        const positionSize = Math.abs(parseFloat(pos.position));
        return positionSize > 0.001;
      });
      
      if (remainingSignificant.length > 0) {
        logger.error(`FAILED: ${remainingSignificant.length} positions still remain open`);
        remainingSignificant.forEach(pos => {
          logger.error(`  ${pos.coin}: ${pos.position}`);
        });
      } else {
        logger.info("SUCCESS: All positions have been closed");
        
        // Clean up database
        logger.info("Cleaning up database records...");
        const activeTrades = await firestoreService.getActiveTrades();
        
        for (const trade of activeTrades) {
          try {
            // Mark all trades as closed with the appropriate reason
            await firestoreService.updateTrade(trade.id as string, {
              status: 'closed',
              closedAt: Date.now(),
              closeReason: 'emergency_fix',
              pnl: '0' // We don't know the exact PnL at this point
            });
            logger.info(`Marked trade ${trade.id} as closed in database`);
          } catch (dbError) {
            logger.error(`Failed to update trade ${trade.id} in database:`, dbError);
          }
        }
        
        logger.info("Database cleanup completed");
        await firestoreService.logEvent("emergency_fix_completed", {
          tradesUpdated: activeTrades.length,
          timestamp: Date.now()
        });
      }
    } else {
      logger.info("All position pairs are balanced! No action needed.");
    }
  } catch (error) {
    logger.error("Error in fixImbalancedPositions script:", error);
  } finally {
    // Wait a moment for any pending logging
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(0);
  }
}

// Run the script
fixImbalancedPositions();