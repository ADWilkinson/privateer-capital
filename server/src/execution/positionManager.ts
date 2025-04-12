import { Decimal } from 'decimal.js';
import { HyperliquidExecutor } from './hyperliquidExecutor';
import { FirestoreService } from '../services/firestoreService';
import { logger } from '../utils/logger';

/**
 * Manages trading positions and their lifecycle
 */
export class PositionManager {
  private executor: HyperliquidExecutor;
  private firestoreService: FirestoreService;

  constructor(executor: HyperliquidExecutor, firestoreService: FirestoreService) {
    this.executor = executor;
    this.firestoreService = firestoreService;
  }

  /**
   * Open a new position
   */
  async openPosition(
    symbol: string,
    side: 'long' | 'short',
    size: Decimal,
    leverage: number = 1,
    stopLoss?: Decimal,
    takeProfit?: Decimal,
    correlatedPair?: { symbol: string; correlation: number }
  ): Promise<string> {
    // Ensure symbol has -PERP suffix for exchange interactions
    if (!symbol.endsWith("-PERP")) {
      symbol = `${symbol}-PERP`;
    }
    try {
      // Convert long/short to buy/sell
      const orderSide = side === 'long' ? 'buy' : 'sell';
      
      // Execute order on exchange
      const orderId = await this.executor.placeMarketOrder(
        symbol,
        orderSide,
        size,
        leverage
      );
      
      // Get position details
      const position = await this.executor.getPosition(symbol);
      const entryPrice = new Decimal(position.entryPx);
      
      // Generate trade ID
      const tradeId = `trade_${symbol}_${Date.now()}`;
      
      // Store trade in Firestore
      await this.firestoreService.createTrade(tradeId, {
        symbol,
        side,
        size: size.toString(),
        entryPrice: entryPrice.toString(),
        leverage,
        status: 'open',
        openedAt: Date.now(),
        orderId,
        stopLoss: stopLoss ? stopLoss.toString() : null,
        takeProfit: takeProfit ? takeProfit.toString() : null,
        correlatedPair: correlatedPair ? JSON.stringify(correlatedPair) : null
      });
      
      // Log event for dashboard
      await this.firestoreService.logEvent('position_opened', { 
        symbol,
        side,
        size: size.toNumber(),
        leverage,
        entryPrice: entryPrice.toNumber(),
        tradeId,
        correlatedPair: correlatedPair || null
      });
      
      logger.info(`Successfully opened ${side} position for ${symbol} with size ${size} and leverage ${leverage}`);
      
      return tradeId;
    } catch (error) {
      logger.error(`Failed to open position for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.firestoreService.logEvent('error_opening_position', {
        symbol,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Close an existing position and its correlated pair if present
   */
  async closePosition(tradeId: string, reason: string): Promise<boolean> {
    try {
      // Get trade details from Firestore
      const trades = await this.firestoreService.getAllTrades();
      const trade = trades.find(t => t.id === tradeId);
      
      if (!trade || trade.status === 'closed') {
        logger.warn(`Attempted to close trade ${tradeId} but it was not found or already closed`);
        return false;
      }
      
      const symbol = trade.symbol as string;
      
      // Check if this is part of a pair trade and get the correlated position
      let correlatedPair: { symbol: string; correlation: number } | null = null;
      let correlatedTradeId: string | null = null;
      
      if (trade.correlatedPair) {
        try {
          correlatedPair = JSON.parse(trade.correlatedPair as string);
          
          // Find the correlated position in active trades
          if (correlatedPair && typeof correlatedPair === 'object' && 'symbol' in correlatedPair) {
            const correlatedTrade = trades.find(t => 
              t.symbol === correlatedPair!.symbol && 
              t.status === 'open' &&
              t.id !== tradeId
            );
            
            if (correlatedTrade) {
              correlatedTradeId = correlatedTrade.id as string;
              logger.info(`Found correlated trade ${correlatedTradeId} for ${symbol}`);
            }
          }
        } catch (parseError) {
          logger.error(`Error parsing correlatedPair data for trade ${tradeId}: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }
      }
      
      // Close position on exchange
      logger.info(`Closing position for ${symbol} (${tradeId})`);
      const orderId = await this.executor.closePosition(symbol, new Decimal(trade.size as string), trade.leverage as number);
      
      // Get final position details
      const position = await this.executor.getPosition(symbol);
      const unrealizedPnl = new Decimal(position.unrealizedPnl);
      
      // Update trade status in Firestore
      await this.firestoreService.updateTrade(tradeId, {
        status: 'closed',
        closedAt: Date.now(),
        pnl: unrealizedPnl.toString(),
        closeOrderId: orderId,
        closeReason: reason
      });
      
      // Log event for dashboard
      await this.firestoreService.logEvent('position_closed', {
        tradeId,
        symbol,
        pnl: unrealizedPnl.toNumber(),
        reason,
        closeOrderId: orderId,
        hasPair: !!correlatedTradeId
      });
      
      logger.info(`Successfully closed trade ${tradeId} for ${symbol} with PnL ${unrealizedPnl}`);
      
      // If this is part of a pair trade, close the correlated position if it exists and is still open
      if (correlatedTradeId) {
        logger.info(`Closing correlated position ${correlatedTradeId} to maintain pair integrity`);
        
        try {
          // Check if the correlated trade is still open
          const correlatedTrade = trades.find(t => t.id === correlatedTradeId);
          
          if (correlatedTrade && correlatedTrade.status === 'open') {
            // Close the correlated position with a related reason
            const pairReason = `${reason}_pair`;
            
            // Get correlatedPair symbol
            const correlatedSymbol = correlatedTrade.symbol as string;
            
            // Close the correlated position
            const correlatedOrderId = await this.executor.closePosition(
              correlatedSymbol, 
              new Decimal(correlatedTrade.size as string), 
              correlatedTrade.leverage as number
            );
            
            // Get final position details for the correlated position
            const correlatedPosition = await this.executor.getPosition(correlatedSymbol);
            const correlatedPnl = new Decimal(correlatedPosition.unrealizedPnl);
            
            // Update correlated trade status in Firestore
            await this.firestoreService.updateTrade(correlatedTradeId, {
              status: 'closed',
              closedAt: Date.now(),
              pnl: correlatedPnl.toString(),
              closeOrderId: correlatedOrderId,
              closeReason: pairReason
            });
            
            // Log event for dashboard
            await this.firestoreService.logEvent('position_closed', {
              tradeId: correlatedTradeId,
              symbol: correlatedSymbol,
              pnl: correlatedPnl.toNumber(),
              reason: pairReason,
              closeOrderId: correlatedOrderId,
              pairedWith: tradeId
            });
            
            logger.info(`Successfully closed correlated trade ${correlatedTradeId} for ${correlatedSymbol} with PnL ${correlatedPnl}`);
          } else {
            logger.info(`Correlated position ${correlatedTradeId} is already closed, no action needed`);
          }
        } catch (pairError) {
          // Log the error but don't fail the whole operation
          logger.error(`Error closing correlated position ${correlatedTradeId}: ${pairError instanceof Error ? pairError.message : 'Unknown error'}`);
          
          await this.firestoreService.logEvent('error_closing_correlated_position', {
            originalTradeId: tradeId,
            correlatedTradeId,
            error: pairError instanceof Error ? pairError.message : 'Unknown error',
            stack: pairError instanceof Error ? pairError.stack : undefined
          });
        }
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to close trade ${tradeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.firestoreService.logEvent('error_closing_position', {
        tradeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Update all open positions
   */
  async updateOpenPositions(): Promise<void> {
    try {
      const trades = await this.firestoreService.getActiveTrades();
      logger.info(`Updating ${trades.length} open positions`);
      
      // Get exchange positions
      const exchangePositions = await this.executor.getAllPositions();
      
      for (const trade of trades) {
        const symbol = trade.symbol as string;
        const tradeId = trade.id as string;
        
        try {
          // Get position from exchange
          const position = exchangePositions.find(p => p.coin === symbol) || 
                          await this.executor.getPosition(symbol);
          
          // Position no longer exists on exchange
          if (position.position === '0') {
            await this.firestoreService.updateTrade(tradeId, {
              status: 'closed',
              closedAt: Date.now(),
              closeReason: 'external',
              finalPnl: '0',
              currentPrice: position.markPx || '0'
            });
            continue;
          }
          
          // Calculate unrealized PnL
          const unrealizedPnl = new Decimal('unrealizedPnl' in position ? position.unrealizedPnl : '0');
          const currentPrice = new Decimal(position.markPx || '0');
          
          // Update trade with current data
          await this.firestoreService.updateTrade(tradeId, {
            currentPrice: currentPrice.toString(),
            unrealizedPnl: unrealizedPnl.toString(),
            lastUpdated: Date.now()
          });
          
          // Check for stop loss/take profit based on price levels
          if (trade.stopLoss && trade.entryPrice) {
            const stopLossPrice = new Decimal(trade.stopLoss.toString());
            const side = trade.side as 'long' | 'short';
            
            // For long positions: stop loss is triggered when price falls below stopLossPrice
            // For short positions: stop loss is triggered when price rises above stopLossPrice
            const stopLossTriggered = 
              (side === 'long' && currentPrice.lessThanOrEqualTo(stopLossPrice)) ||
              (side === 'short' && currentPrice.greaterThanOrEqualTo(stopLossPrice));
            
            if (stopLossTriggered) {
              logger.info(`Stop loss triggered for ${symbol} at price ${currentPrice} (stop: ${stopLossPrice})`);
              await this.closePosition(tradeId, 'stop_loss');
              continue;
            }
          }
          
          if (trade.takeProfit && trade.entryPrice) {
            const takeProfitPrice = new Decimal(trade.takeProfit.toString());
            const side = trade.side as 'long' | 'short';
            
            // For long positions: take profit is triggered when price rises above takeProfitPrice
            // For short positions: take profit is triggered when price falls below takeProfitPrice
            const takeProfitTriggered = 
              (side === 'long' && currentPrice.greaterThanOrEqualTo(takeProfitPrice)) ||
              (side === 'short' && currentPrice.lessThanOrEqualTo(takeProfitPrice));
            
            if (takeProfitTriggered) {
              logger.info(`Take profit triggered for ${symbol} at price ${currentPrice} (target: ${takeProfitPrice})`);
              await this.closePosition(tradeId, 'take_profit');
              continue;
            }
          }
        } catch (error) {
          logger.error(`Error updating position for ${symbol}:`, error);
        }
      }
      
      // After updating all positions, update account metrics
      await this.updateAccountMetrics();
    } catch (error) {
      logger.error('Error updating open positions:', error);
      throw error;
    }
  }

  /**
   * Update account metrics
   */
  private async updateAccountMetrics(): Promise<void> {
    try {
      // Get portfolio value
      const { portfolioValue, availableMargin } = await this.executor.getAccountBalanceAndPortfolioValue();
      
      // Get previous metrics for comparison
      const lastMetrics = await this.firestoreService.getBotPerformance();
      const lastBalance = lastMetrics.accountMetrics &&
                         (lastMetrics.accountMetrics as any).totalBalance || 0;
      
      // Calculate daily PnL
      const dailyPnl = portfolioValue - Number(lastBalance);
      
      // Update metrics in Firestore
      await this.firestoreService.updateAccountMetrics({
        timestamp: Date.now(),
        totalBalance: portfolioValue,
        availableMargin,
        dailyPnl
      });
    } catch (error) {
      logger.error('Error updating account metrics:', error);
    }
  }

  /**
   * Get active positions
   */
  async getActivePositions(): Promise<any[]> {
    return this.firestoreService.getActivePositions();
  }

  /**
   * Get the current value of a position
   * @param tradeId The ID of the trade to get the value for
   * @returns The current value of the position (positive for profit, negative for loss)
   */
  async getPositionValue(tradeId: string): Promise<number> {
    try {
      // Get trade details from Firestore
      const trades = await this.firestoreService.getAllTrades();
      const trade = trades.find(t => t.id === tradeId);
      
      if (!trade || trade.status === 'closed') {
        logger.warn(`Attempted to get value for trade ${tradeId} but it was not found or already closed`);
        return 0;
      }
      
      const symbol = trade.symbol as string;
      
      // Get position from exchange
      const position = await this.executor.getPosition(symbol);
      
      // Calculate unrealized PnL
      const unrealizedPnl = new Decimal('unrealizedPnl' in position ? position.unrealizedPnl : '0');
      
      return unrealizedPnl.toNumber();
    } catch (error) {
      logger.error(`Error getting position value for trade ${tradeId}:`, error);
      return 0;
    }
  }
}