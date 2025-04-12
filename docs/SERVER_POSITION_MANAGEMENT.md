# Position Management System - Privateer Capital

## Overview

This documentation covers the enhanced position management system implemented in the trading engine. The system ensures robust handling of pair trades with equal dollar value sizing and trade lifecycle integrity.

## Key Components

### 1. Correlation Threshold

- The correlation threshold has been increased to **0.95** (from 0.8) to focus on high-quality pair trades
- Only assets with very strong correlation are considered for trading
- This reduces the number of eligible pairs but increases the probability of successful mean reversion
- Uses data points-based approach instead of time-based analysis

### 2. Position Sizing

The position management system ensures equal dollar value for both sides of a pair trade through:

- Equal dollar value allocation for both assets in a pair
- Precise position size calculation based on current prices
- Size adjustments to maintain balance while respecting exchange tick size requirements
- Fine-tuning to keep dollar value difference below 5% between pair sides

### 3. Trade Integrity Safeguards

To maintain pair trade integrity, the system implements several layers of validation:

- **Pre-Trade Validation**: Checks that neither asset is already involved in another trade
- **Asset Usage Protection**: Prevents an asset from being used in multiple positions
- **Pair Alignment**: Ensures both sides of a pair are always opened and closed together
- **Error Recovery**: If one side of a pair fails to open, the other is automatically closed

### 4. Position Lifecycle Management

The system manages the entire lifecycle of positions with enhanced safeguards:

- **Opening**: Validates asset availability and calculates optimal position sizes
- **Monitoring**: Tracks both positions in a pair simultaneously
- **Closing**: Ensures both positions in a pair are closed together regardless of which trigger is activated
- **Risk Management**: Uses PnL thresholds for stop-loss and take-profit instead of price levels

## Enhanced Features

### Semaphore Pattern for Pairs

The system implements a semaphore pattern to ensure pair integrity:
- When opening a position, if the first side succeeds but the second fails, the first position is closed
- When closing a position, the system automatically closes its associated pair position
- Trades are never left in an incomplete state (one side without the other)

### Detailed Logging and Validation

The system includes extensive logging and error tracking:
- Detailed position size calculations with rationale
- Trade validation results with specific failure reasons
- Trade execution details for both sides of a pair
- Rollback operations when trade integrity is compromised

### Error Handling

Robust error handling protects trade integrity:
- Trade validation failures prevent execution rather than creating partial positions
- Database and exchange state are regularly reconciled
- Automatic recovery attempts for certain failure scenarios
- Error events are logged with comprehensive details for analysis

## Configuration Options

The PairsCorrelationStrategy accepts the following enhanced configuration options:

```typescript
{
  correlationThreshold: 0.95, // Minimum correlation coefficient (0.0-1.0)
  minDataPoints: 10,          // Minimum data points for 30-day timeframe
  // Additional options...
}
```

## Test Tools and Verification

Several test scripts have been updated to reflect the new correlation threshold and position management enhancements:

- `testCorrelationAnalysis.ts`: Verifies correlation analysis with the 0.95 threshold
- `analyzeThresholds.ts`: Analyzes trading thresholds with the new parameters
- `checkOpportunities.ts`: Tests opportunity detection with the enhanced position validation
- `runFullStrategy.ts`: Executes the full strategy workflow with the new configuration