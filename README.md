# Privateer Capital - Algorithmic Trading Platform

A sophisticated cryptocurrency trading platform implementing statistical arbitrage strategies on the Hyperliquid exchange. The platform identifies and trades correlated cryptocurrency pairs based on mean reversion principles.

![Privateer Capital](dashboard/public/logo.png)

## Overview

The Privateer Capital algorithmic trading platform identifies statistical relationships between cryptocurrency pairs and executes trades when anomalies occur. The core strategy focuses on Layer 1 networks, looking for assets that historically move together but temporarily diverge, creating trading opportunities.

For example, when two typically correlated assets like SOL and SUI diverge significantly (SOL rises 15% while SUI only rises 2%), the algorithm shorts the outperformer and longs the underperformer, expecting their relationship to normalize.

## System Architecture

The system consists of two primary components:

1. **Trading Engine** (Cloud Run)
   - Statistical analysis module for identifying correlated pairs
   - Real-time price monitoring and opportunity detection
   - Automated trade execution via Hyperliquid API
   - Position management with risk controls
   - Scheduled jobs for regular analysis and trading

2. **Dashboard** (React)
   - Real-time performance monitoring
   - Trade history and active position visualization
   - Correlation pair analytics
   - Risk metrics and portfolio allocation
   - System health monitoring

## Trading Strategy

The platform implements a statistical pairs correlation strategy:

1. **Correlation Analysis**: Identifies highly correlated cryptocurrency pairs using data points-based approach
2. **Cointegration Testing**: Tests for long-term statistical relationships between assets
3. **Z-Score Calculation**: Measures deviation from normal relationship
4. **Signal Generation**: Identifies trading opportunities when z-score exceeds thresholds
5. **Trade Execution**: Opens opposing positions (long/short) in correlated pairs
6. **Position Management**: Manages stop-loss, take-profit, and position sizing
7. **Exit Logic**: Closes positions when relationship normalizes or risk thresholds are breached

## Key Features

- **Asset Whitelist System**: Focus on Layer 1 networks and select DeFi tokens for more predictable correlations
- **Real-time Data Processing**: Continuous monitoring of price relationships
- **Risk Management**: Dynamic position sizing and portfolio allocation
- **Performance Analytics**: Detailed metrics including win rate, P&L, and risk metrics
- **Circuit Breakers**: Emergency stops during extreme market conditions
- **Cloud-native Architecture**: Scalable, resilient infrastructure on Google Cloud

## Technology Stack

### Backend (Trading Engine)
- **Runtime**: Node.js, TypeScript
- **API**: Express.js
- **Database**: Firebase Firestore
- **Hosting**: Google Cloud Run
- **Scheduling**: Google Cloud Scheduler
- **Exchange API**: Hyperliquid SDK
- **Statistical Libraries**: Custom implementations for correlation and cointegration analysis
- **Error Handling**: Retry mechanisms with exponential backoff
- **Rate Limiting**: 30 requests per minute with 200ms interval

### Frontend (Dashboard)
- **Framework**: React with TypeScript
- **State Management**: React Query, Context API
- **UI Components**: Chakra UI
- **Visualization**: Recharts
- **Hosting**: Firebase Hosting
- **Authentication**: Firebase Authentication
- **Caching**: Custom caching for performance optimization

## Deployment Architecture

The platform uses a serverless architecture:

- **Trading Engine**: Containerized on Google Cloud Run
- **Database**: Firebase Firestore for storage
- **Scheduler**: Google Cloud Scheduler for triggering analysis and trading jobs
- **Secrets**: Google Secret Manager for API keys and credentials
- **Dashboard**: Static hosting on Firebase Hosting
- **CI/CD**: Automated deployment scripts

## Scheduled Operations

The system runs on a schedule to optimize resource usage:

- **Price Data Collection**: Hourly via `collect-price-data` job
- **Correlation Analysis**: Every 4 hours
- **Strategy Initialization**: Daily at 01:00 UTC
- **Opportunity Check**: Hourly
- **Trade Updates**: Every 15 minutes
- **Strategy Health Check**: Daily at 07:00 UTC
- **Data Cleanup**: Daily at 01:00 UTC

## Getting Started

### Prerequisites
- Node.js v18+
- Google Cloud SDK
- Firebase CLI
- Docker
- Hyperliquid API key

### Local Development

1. **Set up the server**:
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. **Set up the dashboard**:
   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

3. **Run tests**:
   ```bash
   cd server
   npm test
   ```

### Deployment

Detailed deployment instructions are available in [CLOUD_RUN_DEPLOYMENT.md](CLOUD_RUN_DEPLOYMENT.md).

## API Endpoints

The trading engine exposes several API endpoints for the dashboard:

- `/api/dashboard-data`: Performance metrics and active trades
- `/api/assets`: Asset whitelist information
- `/api/correlations`: Get correlation pairs data
- `/api/refresh-correlations`: Manually refresh correlation analysis
- `/api/trade-history`: Historical trade data
- `/api/health-check`: System health status

For Cloud Scheduler, there are dedicated endpoints:
- `/api/correlation-analysis`: Runs correlation analysis
- `/api/opportunity-check`: Checks for trading opportunities
- `/api/strategy-initialization`: Initializes trading strategy
- `/api/trade-updates`: Updates open trade information
- `/api/collect-price-data`: Collects price data for assets
- `/api/cleanup-data`: Performs database cleanup operations

## Documentation

- [Cloud Run Deployment Guide](CLOUD_RUN_DEPLOYMENT.md)
- [Hyperliquid API Guide](HYPERLIQUID.md)
- [Asset Whitelist System](server/README.asset-whitelist.md)
- [Order Execution System](SERVER_ORDER_EXECUTION.md)
- [Position Management](SERVER_POSITION_MANAGEMENT.md)

## Performance Metrics

The system tracks several key performance metrics:

- **Total P&L**: Overall profit and loss
- **Win Rate**: Percentage of profitable trades
- **Sharpe Ratio**: Risk-adjusted return
- **Maximum Drawdown**: Largest peak-to-trough decline
- **Risk Utilization**: Current risk as percentage of maximum allowed

## Risk Management

The platform implements multiple layers of risk management:

- **Position Sizing**: Dynamic sizing based on correlation confidence
- **Portfolio Allocation**: Maximum exposure limits per asset and overall
- **Stop Loss**: Automatic stop-loss placement for every position
- **Circuit Breakers**: System pauses during extreme market volatility
- **Execution Verification**: Order validation and retry logic

## License

 2025 Privateer Capital. All rights reserved. Proprietary software.