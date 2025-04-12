# Privateer Capital - Development Guide

## Build Commands
- **Dashboard**: `cd dashboard && npm run dev` - Start dashboard dev server
- **Dashboard Build**: `cd dashboard && npm run build` - Build dashboard for production
- **Dashboard Lint**: `cd dashboard && npm run lint` - Lint dashboard code
- **Server**: `cd server && npm run dev` - Start server in dev mode
- **Server Build**: `cd server && npm run build` - Build server for production
- **Server Lint**: `cd server && npm run lint` - Lint server code
- **Server Test**: `cd server && npm test` - Run all server tests
- **Single Test**: `cd server && npx jest <test-name>` - Run a specific test
- **Strategy Test**: `cd server && npm run test-strategy` - Test trading strategy
- **Check Wallet**: `cd server && npm run check-wallet` - Check wallet balance
- **Debug Mode**: `cd server && npm run debug:all` - Run all debug tests
- **Analyze Thresholds**: `cd server && npm run analyze-thresholds` - Run threshold analysis
- **Test Asset Formatting**: `cd server && npm run test-asset-formatting` - Test asset name formatting
- **Validate Asset Mappings**: `cd server && npm run validate-mappings` - Validate asset mappings
- **Check Positions**: `cd server && npm run fix-positions` - Check for imbalanced positions
- **Fix Positions**: `cd server && npm run fix-positions-force` - Force close all positions and reset database
- **Sync Positions**: `cd server && npm run sync-positions` - Synchronize database with exchange positions

## Code Style Guidelines
- **Imports**: Group imports by type (standard library, external, internal)
- **Types**: Use TypeScript interfaces for data structures, export types explicitly
- **Error Handling**: Use try/catch with logger.error/warn from utils/logger.ts
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Formatting**: 2-space indentation, semicolons required
- **Comments**: Use JSDoc style comments for functions and classes
- **React Components**: Functional components with explicit prop typing
- **State Management**: React Query for async data, useState for local state
- **Logging**: Use logger with appropriate levels (info, warn, error, debug)

## Trading System Safeguards

### Position Balance
- Pair trading requires equal number of long and short positions
- The system validates this balance before opening new positions
- Market conditions can sometimes cause imbalances (e.g., one order fills, another doesn't)
- Run `npm run fix-positions` to check for imbalances
- Run `npm run fix-positions-force` to fix imbalances by closing all positions

### Order Execution Strategy
- Uses Immediate-or-Cancel (IOC) orders with progressive fallbacks:
  1. Initial IOC order with 0.5% slippage for market orders
  2. If unfilled, retry with 2.0% slippage
  3. Final fallback to Good-Till-Cancel (GTC) orders with 5.0% slippage
- Special position closure logic with higher slippage thresholds:
  1. Initial IOC order with 2.0% slippage
  2. Emergency attempt with 10% slippage
  3. Final GTC fallback with 15% slippage
- Position closure is verified to ensure complete execution
- Extensive logging for all order steps
- Automated database-exchange position synchronization every 5 minutes

### Risk Management
- Positions are always paired (1 long, 1 short) with equal dollar values
- Maximum position size is limited to 25% of available margin
- Only highly correlated pairs (>0.8) with proper cointegration are traded
- Additional validation ensures assets aren't reused across multiple pairs