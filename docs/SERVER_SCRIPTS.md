# Privateer Capital - Utility Scripts

This directory contains utility scripts for the Privateer Capital trading system.

## Position Management Scripts

### fixImbalancedPositions.ts

The `fixImbalancedPositions.ts` script is designed to detect and fix imbalanced positions in the Hyperliquid exchange. In a properly functioning statistical arbitrage system, positions should always be balanced with equal numbers of long and short positions.

#### Usage

There are two ways to run this script:

1. **Check Mode**: Only checks for imbalances without making changes.
   ```
   npm run fix-positions
   ```

2. **Force Mode**: Closes all positions and updates the database when imbalances are found.
   ```
   npm run fix-positions-force
   ```

#### How It Works

1. Connects to the Hyperliquid exchange using credentials from `.env`
2. Fetches all open positions 
3. Counts long and short positions to detect imbalances
4. In force mode:
   - Closes all positions using a progressive approach (IOC → increased slippage → GTC)
   - Updates the database to mark all trades as closed
   - Logs all actions to Firestore for audit purposes

#### When to Use

Use this script when:
- The dashboard shows unequal numbers of long and short positions
- You suspect a position imbalance issue
- You need to reset all positions and start fresh
- After a network or API disruption that may have affected order execution

#### Safety Features

- Requires explicit `--force` flag to make changes
- Logs all actions extensively
- Uses progressive order execution to ensure positions are properly closed
- Verifies that positions are actually closed before updating the database

#### Dependencies

- Requires environment variables: `HYPERLIQUID_MAIN_WALLET_ADDRESS` and `HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY`
- Requires Firebase Admin SDK initialization
- Depends on Firebase Firestore for data persistence

#### Example Output

When running in check mode with imbalanced positions:
```
Checking for imbalanced positions...
Found 1 longs, 3 shorts
IMBALANCE DETECTED
To close all positions and fix the imbalance, run with --force flag
```

When running in force mode:
```
CLOSING ALL POSITIONS TO RESOLVE IMBALANCE
Closing position for BTC-PERP with size 0.05...
Successfully closed position for BTC-PERP
...
SUCCESS: All positions have been closed
Database cleanup completed
```