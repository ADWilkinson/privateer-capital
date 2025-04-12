import { logger } from '../utils/logger';

// server/src/utils/assetMappings.ts

// Map of Hyperliquid symbols to CoinGecko IDs
// This list represents our whitelisted assets for pair trading
export const coinGeckoIds: { [symbol: string]: string } = {
  ETH: "ethereum",
  ARB: "arbitrum",
  OP: "optimism",
  STRK: "starknet",
  CELO: "celo",
  MNT: "mantle",
  BLAST: "blast",
  AAVE: "aave",
  ENA: "ethena",
  LINK: "chainlink",
  UNI: "uniswap",
  MKR: "maker",
  LDO: "lido-dao",
  CRV: "curve-dao-token",
  PENDLE: "pendle",
  EIGEN: "eigenlayer",
  GMX: "gmx",
};

// Whitelist of assets for correlation analysis
// We use Hyperliquid symbols here
export const analysisWhitelist = Object.keys(coinGeckoIds);

// Create reverse mapping: CoinGecko ID -> Hyperliquid Symbol
export const coinGeckoToHyperliquid: { [id: string]: string } = {};
for (const [hyperliquidSymbol, coinGeckoId] of Object.entries(coinGeckoIds)) {
  coinGeckoToHyperliquid[coinGeckoId] = hyperliquidSymbol;
}

/**
 * Get canonical Hyperliquid symbol from any input symbol
 * @param symbol Input symbol (can be any case)
 * @returns Normalized Hyperliquid symbol (uppercase)
 */
export const getHyperliquidSymbol = (symbol: string): string => {
  // Remove -PERP suffix if present
  const baseSymbol = symbol.replace(/-PERP$/, '').toUpperCase();
  
  // Return the normalized symbol
  return baseSymbol;
};

/**
 * Get CoinGecko ID for a Hyperliquid symbol
 * @param symbol Hyperliquid symbol
 * @returns CoinGecko ID or null if not found
 */
export const getCoinGeckoId = (symbol: string): string | null => {
  const normalizedSymbol = getHyperliquidSymbol(symbol);
  return coinGeckoIds[normalizedSymbol] || null;
};

/**
 * Checks if a symbol is in our whitelist
 */
export function isWhitelisted(symbol: string | number): boolean {
  // Convert index to symbol if it's a number
  let baseSymbol: string;
  if (typeof symbol === 'number') {
    const symbolEntries = Object.entries(coinGeckoIds);
    if (symbol >= 0 && symbol < symbolEntries.length) {
      baseSymbol = symbolEntries[symbol][0];
    } else {
      logger.warn(`Asset index ${symbol} is out of bounds`);
      return false;
    }
  } else {
    // Remove -PERP suffix if present
    baseSymbol = symbol.replace(/-PERP$/, '');
  }
  
  // Check if the base symbol is in the whitelist
  const isInWhitelist = analysisWhitelist.includes(baseSymbol.toUpperCase());
  
  if (!isInWhitelist) {
    logger.warn(`Asset ${symbol} (base: ${baseSymbol}) is not in whitelist`);
  }
  
  return isInWhitelist;
}

/**
 * Format an asset symbol by adding -PERP suffix if not already present
 * @param symbol The asset symbol to format (e.g., "ETH" or "ETH-PERP")
 * @returns The formatted symbol with -PERP suffix (e.g., "ETH-PERP")
 */
export function formatAssetSymbol(symbol: string): string {
  if (!symbol) return "";
  
  // Remove any existing -PERP suffix
  const baseSymbol = symbol.replace(/-PERP$/, "");
  
  // Add -PERP suffix if not already present
  return `${baseSymbol}-PERP`;
}