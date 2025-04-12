# Privateer Capital - Dashboard

This directory contains the web-based dashboard for monitoring and interacting with the Privateer Capital algorithmic trading platform. The dashboard provides real-time performance metrics, trade visualization, and system health monitoring.

## Technology Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Chakra UI
- **State Management**: React Query, Context API
- **Routing**: React Router
- **Charts**: Recharts
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Backend**: Firebase Firestore and Cloud Run API

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables:
   - Create a `.env` file based on `.env.example`
   - Add your Firebase configuration
   - Add the trading engine API URL

3. Run in development mode:
   ```
   npm run dev
   ```

4. Build for production:
   ```
   npm run build
   ```

## Key Features

- **Performance Dashboard**: Overview of key trading metrics
- **Active Trades View**: Real-time monitoring of open positions
- **Correlation Analysis**: Visualization of correlated asset pairs
- **Settings Panel**: Customize dashboard behavior and preferences
- **Trade History**: Historical trade performance and analytics
- **Risk Metrics**: Portfolio allocation and risk utilization
- **System Health Monitoring**: Bot status and error tracking

## Project Structure

- `/src/components`: Reusable UI components
  - `/cards`: Metric cards and dashboard components
  - `/layout`: Layout components (header, sidebar, etc.)
- `/src/context`: React context providers
- `/src/hooks`: Custom React hooks
- `/src/pages`: Main page components
- `/src/services`: API service layer
- `/src/utils`: Utility functions
- `/public`: Static assets and icons

## Key Components

### Dashboard

The main dashboard (`/src/pages/Dashboard.tsx`) displays:
- Account balance and P&L
- Win rate and trade statistics
- Active trades table
- Performance history chart
- Correlated pairs table

### Trade Management

The trades view (`/src/pages/Trades.tsx`) provides:
- List of all active and historical trades
- Trade details and performance
- Filtering and sorting options

### Correlation Analysis

The correlations view (`/src/pages/Correlations.tsx`) shows:
- Highly correlated cryptocurrency pairs
- Correlation strength visualization
- Spread analysis for pairs

## Data Fetching

The dashboard uses React Query for data fetching with custom hooks:
- `useDashboardData`: Fetches main dashboard metrics
- `useTradeHistory`: Retrieves trade history data
- `usePerformanceHistory`: Gets historical performance data
- `useCorrelationPairs`: Fetches correlation analysis results
- `useQueryWithRefresh`: Custom hook for data fetching with automatic refresh
- `useBotEvents`: Retrieves system event logs for monitoring

Data fetching includes client-side caching using:
- React Query's built-in caching
- Custom cache implementation in `utils/cache.ts`
- Automatic retry mechanisms for improved reliability

## API Endpoints

The dashboard interacts with the following API endpoints:

- `/api/dashboard-data`: Performance metrics and active trades
- `/api/assets`: Asset whitelist information
- `/api/correlations`: Get correlation pairs data
- `/api/refresh-correlations`: Manually refresh correlation analysis
- `/api/trade-history`: Historical trade data
- `/api/health-check`: System health status

## Deployment

The dashboard is designed to be deployed on Firebase Hosting:

```
npm run build
firebase deploy --only hosting
```

For detailed deployment instructions, see [../CLOUD_RUN_DEPLOYMENT.md](../CLOUD_RUN_DEPLOYMENT.md).

## Troubleshooting

If you encounter issues:

1. **Check Firebase Console** for deployment errors
2. **Verify API URL** in your `.env` file
3. **Check Cloud Run logs** for backend errors
4. **Monitor Firestore** for data consistency issues

## Performance Optimization

The dashboard implements several performance optimizations:
- Client-side caching with React Query
- Data pagination for large datasets
- Lazy loading of components
- Code splitting for faster initial loads
- Optimized API request batching