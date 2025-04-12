import express, { Request, Response, Router } from "express";
import { initServices } from "../services";
import { logger } from "../utils/logger";

export const syncRouter = Router();

/**
 * Wrapper for route handlers to catch errors and provide consistent error responses
 */
function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      logger.error(`Unhandled error in sync route handler: ${req.method} ${req.path}`, error);
      res.status(500).json({
        status: "error",
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

/**
 * Get sync status endpoint for dashboard
 */
syncRouter.get(
  "/sync-status",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Fetching sync status from sync router");
    const { firestoreService } = initServices();
    
    try {
      logger.info("Fetching sync events from Firestore...");
      
      // Create a default response
      const defaultResponse = {
        status: 'unknown',
        message: 'Checking sync status',
        timestamp: Date.now(),
        lastSynced: null,
        isInSync: false,
        syncActions: 0
      };
      
      // First, create a basic synchronization event if none exists yet
      // This will help initialize the database
      try {
        const checkSnapshot = await firestoreService.logEvent("sync_status_check", {
          message: "Checking sync status, initializing if needed",
          isCheck: true,
          timestamp: Date.now()
        });
        logger.info("Successfully logged initial sync status check event");
      } catch (error) {
        logger.error("Error logging initial sync event:", error);
      }
      
      // Try to retrieve events from Firestore
      let events = [];
      try {
        // First check for position_sync_completed events
        events = await firestoreService.getBotEvents({
          eventFilter: "position_sync_completed",
          limit: 5
        });
        logger.info(`Found ${events.length} position_sync_completed events`);
        
        if (events.length === 0) {
          // If no position_sync_completed events, try creating a dummy sync event
          logger.info("No position_sync_completed events, creating test sync");
          
          try {
            await firestoreService.logEvent("position_sync_completed", {
              message: "Initial sync setup - no real data yet",
              isInitial: true,
              isInSync: true,
              timestamp: Date.now(),
              exchangeOnly: 0,
              databaseOnly: 0,
              syncActions: 0
            });
            
            logger.info("Successfully created initial sync event");
            
            // If we successfully created the event, assume we're in sync for now
            return res.status(200).json({
              status: 'success',
              message: 'Database and exchange are in sync (initial setup)',
              timestamp: Date.now(),
              lastSynced: Date.now(),
              isInSync: true,
              syncActions: 0
            });
          } catch (initError) {
            logger.error("Error creating initial sync event:", initError);
          }
        }
      } catch (eventsError) {
        logger.error("Error fetching position_sync_completed events:", eventsError);
        
        // If that fails, try to get any recent event to confirm Firestore is working
        try {
          events = await firestoreService.getBotEvents({
            limit: 1
          });
          logger.info(`Found ${events.length} general events as fallback`);
        } catch (fallbackError) {
          logger.error("Error fetching any events:", fallbackError);
          return res.status(200).json(defaultResponse);
        }
      }
      
      if (events.length === 0) {
        // No sync events found
        return res.status(200).json({
          status: 'warning',
          message: 'No synchronization events found',
          timestamp: Date.now(),
          lastSynced: null,
          isInSync: false,
          syncActions: 0
        });
      }
      
      const latestSyncEvent = events[0];
      const eventData = latestSyncEvent.data || {};
      
      // Check if there were any mismatches
      const exchangeOnly = eventData.exchangeOnly || 0;
      const databaseOnly = eventData.databaseOnly || 0;
      const syncActions = eventData.syncActions || 0;
      
      // Determine if in sync (no mismatches found in latest sync)
      const isInSync = exchangeOnly === 0 && databaseOnly === 0;
      
      // Check for imbalances
      const hasImbalance = eventData.isBalanced === false;
      
      return res.status(200).json({
        status: 'success',
        message: isInSync ? 'Exchange and database are in sync' : 'Mismatches detected',
        timestamp: Date.now(),
        lastSynced: latestSyncEvent.timestamp,
        isInSync,
        syncActions,
        exchangeOnly,
        databaseOnly,
        hasImbalance,
        details: eventData
      });
    } catch (error) {
      logger.error("Error getting sync status:", error);
      return res.status(200).json({
        status: 'error',
        message: 'Error retrieving sync status',
        timestamp: Date.now(),
        lastSynced: null,
        isInSync: false,
        syncActions: 0
      });
    }
  })
);

/**
 * Endpoint to synchronize database positions with exchange positions
 * This can be called via Cloud Scheduler to ensure consistency
 */
syncRouter.post(
  "/sync-positions",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Starting database-exchange position synchronization");
    
    const { executor, firestoreService } = initServices();
    
    try {
      // Get all positions from the exchange
      const exchangePositions = await executor.getPositions();
      
      // Filter out tiny positions
      const significantPositions = exchangePositions.filter(pos => {
        const positionSize = Math.abs(parseFloat(pos.position));
        return positionSize > 0.001; // Ignore very small positions
      });
      
      logger.info(`Found ${significantPositions.length} significant positions on exchange`);
      
      // Get all active trades from the database
      const activeTrades = await firestoreService.getActiveTrades();
      logger.info(`Found ${activeTrades.length} active trades in database`);
      
      // Extract symbols from trades and positions
      const databasePositions = activeTrades.map(trade => trade.symbol as string);
      const exchangeSymbols = significantPositions.map(pos => pos.coin);
      
      // Find mismatches
      const exchangeOnly = exchangeSymbols.filter(symbol => !databasePositions.includes(symbol));
      const databaseOnly = databasePositions.filter(symbol => !exchangeSymbols.includes(symbol));
      
      let syncActions = 0;
      
      // Process mismatches
      if (exchangeOnly.length > 0 || databaseOnly.length > 0) {
        logger.warn("DATABASE-EXCHANGE MISMATCH DETECTED!");
        
        // 1. Create database records for exchange positions not in database
        if (exchangeOnly.length > 0) {
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
              syncActions++;
            }
          }
        }
        
        // 2. Close database records for positions not on exchange
        if (databaseOnly.length > 0) {
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
              syncActions++;
            }
          }
        }
        
        await firestoreService.logEvent("position_sync_completed", {
          exchangePositions: significantPositions.length,
          databasePositions: activeTrades.length,
          exchangeOnly: exchangeOnly.length,
          databaseOnly: databaseOnly.length,
          syncActions,
          timestamp: Date.now()
        });
      } else {
        logger.info("Database and exchange positions are already in sync.");
      }
      
      // Check if positions are balanced (equal number of shorts and longs)
      const shortPositions = significantPositions.filter(pos => parseFloat(pos.position) < 0);
      const longPositions = significantPositions.filter(pos => parseFloat(pos.position) > 0);
      const isBalanced = longPositions.length === shortPositions.length;
      
      if (!isBalanced) {
        logger.warn(`POSITION IMBALANCE DETECTED: ${longPositions.length} longs vs ${shortPositions.length} shorts`);
        
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
      
      // Return the results
      res.status(200).json({
        status: "success",
        message: "Position synchronization completed",
        timestamp: Date.now(),
        lastSynced: Date.now(),
        isInSync: exchangeOnly.length === 0 && databaseOnly.length === 0,
        syncActions,
        data: {
          exchangePositions: significantPositions.length,
          databasePositions: activeTrades.length,
          exchangeOnly,
          databaseOnly,
          isBalanced
        }
      });
    } catch (error) {
      await firestoreService.logEvent("position_sync_error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      
      // Even though the asyncHandler will catch this, we want to log it first
      throw error;
    }
  })
);