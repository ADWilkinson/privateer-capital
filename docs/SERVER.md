# Privateer Capital - Trading Engine

This directory contains the trading engine component of the Privateer Capital algorithmic trading platform, responsible for correlation analysis, trading signal generation, and execution via the Hyperliquid exchange.

## Architecture

The trading engine is built as a Node.js/TypeScript application with the following key components:

- **Analysis Module**: Identifies highly correlated pairs (data points-based approach) and generates trading signals
- **Execution Module**: Handles trade execution with robust position management and pair integrity
- **Scheduler**: Coordinates scheduled operations via Cloud Scheduler
- **API Service**: Provides endpoints for the dashboard and monitoring
- **Firestore Service**: Manages persistent data storage
- **Price Data Service**: Collects and analyzes market data

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables:
   - Create a `.env` file based on `.env.example`
   - Add your Hyperliquid wallet private key

3. Run in development mode:
   ```
   npm run dev
   ```

4. Build for production:
   ```
   npm run build
   ```

## Key Modules

### Analysis

The `correlationAnalyzer.ts` class is responsible for:
- Finding highly correlated cryptocurrency pairs (data points-based approach)
- Testing for cointegration (long-term statistical relationships)
- Calculating spread z-scores for pairs
- Fetching historical price data using data points instead of time-based queries

### Execution

The trading engine executes trades via two key classes:
- `hyperliquidExecutor.ts`: Interacts with Hyperliquid API with enhanced features:
  - Progressive fallback order execution with multiple attempts
  - Robust order verification and error recovery
  - Automatic retry with increasing slippage for order reliability
  - Special handling for position closure with aggressive fallback strategy
  - Rate limiting protection (30 requests per minute, 200ms interval)
  - Network error detection with timeout (15 seconds)
- `positionManager.ts`: Manages trade positions with enhanced safeguards:
  - Ensures both sides of a pair trade are opened/closed together
  - Maintains equal dollar value position sizing for pairs
  - Prevents assets from being used in multiple trades
  - Validates trade integrity throughout the lifecycle
  - Stop-loss and take-profit defined as PnL thresholds

### Scheduler

The `scheduler.ts` module configures several scheduled jobs:
- Price data collection (hourly via collect-price-data job)
- Correlation analysis (integrated with price data collection)
- Strategy initialization (daily)
- Opportunity checking (hourly)
- Trade updates (every 15 minutes)
- Health checks (daily)
- Position synchronization (every 5 minutes)
- Data cleanup (daily)

The position synchronization job ensures database-exchange consistency by reconciling positions between our database records and the actual exchange state.

## API Endpoints

The server exposes several endpoints for the dashboard:

- `/api/ping`: Basic health check
- `/api/health-check`: Detailed system health status
- `/api/dashboard-data`: Performance metrics for the dashboard
- `/api/assets`: Asset whitelist information
- `/api/manual-check`: Triggers a manual opportunity check
- `/api/refresh-correlations`: Manually refresh correlation analysis

For Cloud Scheduler, there are dedicated endpoints:
- `/api/correlation-analysis`: Runs correlation analysis
- `/api/opportunity-check`: Checks for trading opportunities
- `/api/strategy-initialization`: Initializes trading strategy
- `/api/trade-updates`: Updates open trade information
- `/api/collect-price-data`: Collects price data for assets
- `/api/cleanup-data`: Performs database cleanup operations

For position synchronization and maintenance:
- `/sync/sync-positions`: Reconciles database positions with exchange positions

## Secrets Management

All sensitive information is managed through Google Cloud Secret Manager:
- Hyperliquid private key
- Firebase service account credentials
- Environment variables are accessed from Secret Manager at runtime

## Testing

Run tests with:
```
npm test
```

For a specific test:
```
npx jest <test-name>
```

## Analysis Scripts

The trading engine includes several specialized scripts for analysis and testing:

```bash
# Analyze correlation and z-score thresholds
npm run analyze-thresholds

# Test asset formatting and mappings
npm run test-asset-formatting

# Validate asset mappings between exchanges
npm run validate-mappings

# Check for current trading opportunities
npm run check-opportunities
```

## Asset Whitelist

The trading engine uses a whitelist system to focus on specific cryptocurrencies, currently Layer 1 networks. See [README.asset-whitelist.md](./README.asset-whitelist.md) for details.

## Debug Tools

Several debug tools are available:
```
npm run debug:env          # Check environment variables
npm run debug:direct-api   # Test direct API connection
npm run debug:credentials  # Test credential access
npm run debug:cloud-api    # Test Cloud Run API
npm run debug:compare      # Compare local vs cloud environments
npm run debug:all          # Run all debug tests
```

## Deployment

The trading engine is designed to be deployed on Google Cloud Run. For detailed deployment instructions, see [../CLOUD_RUN_DEPLOYMENT.md](../CLOUD_RUN_DEPLOYMENT.md).