# Asset Whitelist System

This document explains the asset whitelist system that filters which crypto assets we analyze for correlation trading. Our focus has expanded beyond just Layer 1 networks to include select DeFi tokens.

## Overview

The asset whitelist system consists of:

1. **Asset Mapping** - Maps between CoinGecko IDs and Hyperliquid symbols
2. **Asset Categories** - Includes both Layer 1 networks and DeFi tokens
3. **Whitelist** - Specific list of assets we use for correlation analysis
4. **Helper Functions** - Utility functions to check whitelist status and handle symbol conversions

## Implementation Details

### Location

The main implementation is in `server/src/utils/assetMappings.ts`. This file contains:

- `coinGeckoIds`: Maps Hyperliquid symbols to CoinGecko IDs (includes Layer 1 networks and DeFi tokens)
- `analysisWhitelist`: Generated from the keys in coinGeckoIds
- `coinGeckoToHyperliquid`: Reverse mapping from CoinGecko IDs to Hyperliquid symbols
- Utility functions: `getHyperliquidSymbol()`, `getCoinGeckoId()`, and `isWhitelisted()`
- Utility functions for symbol conversion and whitelist checking

### Integration Points

The whitelist system is integrated in these key components:

1. **Correlation Analyzer** (`correlationAnalyzer.ts`)
   - Filters assets to only include whitelisted ones
   - Maps between Hyperliquid symbols and CoinGecko IDs for data fetching

2. **API Endpoints** (`api.ts`)
   - Added `/api/assets` endpoint to expose whitelist information
   - Provides categorized asset information

3. **Testing** (`test-asset-whitelist.ts` and `test-asset-whitelist.sh`)
   - Verifies whitelist filtering is working correctly
   - Checks API endpoint responses

## Asset Focus

We now include two main categories of assets:

### Layer 1 Networks
- Ethereum (ETH)
- Arbitrum (ARB)
- Optimism (OP)
- Starknet (STRK)
- Celo (CELO)
- Mantle (MNT)
- Blast (BLAST)

### DeFi Tokens
- Aave (AAVE)
- Ethena (ENA)
- Chainlink (LINK)
- Uniswap (UNI)
- Maker (MKR)
- Lido DAO (LDO)
- Curve DAO (CRV)
- Pendle (PENDLE)
- EigenLayer (EIGEN)
- GMX (GMX)

This expanded approach provides:
1. More correlation opportunities across different asset types
2. Cross-sector relationships that may be overlooked by other traders
3. Greater diversification in the strategy
4. More data points for robust statistical analysis

## Whitelist Criteria

Assets are included in the whitelist based on:

- Market liquidity (sufficient trading volume on Hyperliquid)
- Protocol maturity and adoption
- Correlation potential with other assets
- Historical price data availability through CoinGecko
- Trading volume consistency

## How to Test

To test the asset whitelist implementation:

```bash
# Make sure you're in the server directory
cd server

# Run the test script
./src/debug/test-asset-whitelist.sh
```

The test will:
1. Fetch all available assets from Hyperliquid
2. Filter using the whitelist
3. Test the API endpoint if a server is running

## Future Extensions

We are considering further extensions to the whitelist:
- AI-related tokens (FET, OCEAN, etc.)
- Gaming tokens (IMX, GALA, etc.)
- Select liquid meme coins with sufficient trading volume
- Real-world asset (RWA) tokens as they become more established
- Decentralized exchange (DEX) tokens with consistent volume

## API Usage

Use the `/api/assets` endpoint to get information about available assets:

```
GET /api/assets
```

Response includes:
- All available assets from Hyperliquid (`assets.all`)
- Whitelisted assets that pass our filtering criteria (`assets.whitelisted`)
- Status code and timestamp for monitoring

## Troubleshooting

If you encounter issues:

- Check the logs for specific error messages
- Verify that assets exist in both the Hyperliquid exchange and CoinGecko
- Ensure symbols are correctly mapped
- Run the test script to diagnose specific issues