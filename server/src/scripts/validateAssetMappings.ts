import { Hyperliquid } from 'hyperliquid';
import * as dotenv from 'dotenv';
import { coinGeckoIds, analysisWhitelist, getHyperliquidSymbol } from '../utils/assetMappings';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Script to validate asset mappings against available markets on Hyperliquid
 * Checks for:
 * 1. Assets in our mappings that aren't tradable on Hyperliquid
 * 2. Tradable assets on Hyperliquid that aren't in our mappings
 * 3. Assets in our whitelist that aren't tradable
 */
async function validateAssetMappings() {
  logger.info('Validating asset mappings against Hyperliquid available markets...');

  // Step 1: Get all available markets from Hyperliquid
  const availableMarkets = await getHyperliquidMarkets();
  if (!availableMarkets || availableMarkets.length === 0) {
    logger.error('Failed to fetch available markets from Hyperliquid');
    return;
  }
  
  logger.info(`Found ${availableMarkets.length} available markets on Hyperliquid`);
  
  // Convert to a Set for faster lookups
  const availableMarketsSet = new Set(availableMarkets);
  
  // Step 2: Check our mappings against available markets
  const mappedSymbols = Object.keys(coinGeckoIds);
  const invalidMappings: string[] = [];
  
  for (const symbol of mappedSymbols) {
    if (!availableMarketsSet.has(getHyperliquidSymbol(symbol))) {
      invalidMappings.push(symbol);
    }
  }
  
  // Step 3: Check for assets on Hyperliquid not in our mappings
  const mappedToHyperliquidSet = new Set(Object.values(coinGeckoIds));
  const unmappedMarkets: string[] = [];
  
  for (const market of availableMarkets) {
    if (!mappedToHyperliquidSet.has(market)) {
      unmappedMarkets.push(market);
    }
  }
  
  // Step 4: Check our whitelist against available markets
  const invalidWhitelist: string[] = [];
  
  for (const symbol of analysisWhitelist) {
    // Find corresponding Hyperliquid symbol
    const hyperliquidSymbol = getHyperliquidSymbol(symbol) || symbol;
    if (!availableMarketsSet.has(hyperliquidSymbol)) {
      invalidWhitelist.push(symbol);
    }
  }
  
  // Display results
  console.log('\n=== ASSET MAPPING VALIDATION REPORT ===');
  
  console.log(`\nTotal available markets on Hyperliquid: ${availableMarkets.length}`);
  console.log(`Total assets in our mappings: ${mappedSymbols.length}`);
  console.log(`Total assets in our whitelist: ${analysisWhitelist.length}`);
  
  if (invalidMappings.length > 0) {
    console.log('\n⚠️  INVALID MAPPINGS - following assets in our mappings are NOT tradable on Hyperliquid:');
    invalidMappings.forEach(symbol => console.log(`- ${symbol} (mapped to ${getHyperliquidSymbol(symbol)})`));
  } else {
    console.log('\n✅ All assets in our mappings are tradable on Hyperliquid');
  }
  
  if (unmappedMarkets.length > 0) {
    console.log('\n🔍 UNMAPPED MARKETS - following markets on Hyperliquid are NOT in our mappings:');
    unmappedMarkets.forEach(market => console.log(`- ${market}`));
  } else {
    console.log('\n✅ All Hyperliquid markets are included in our mappings');
  }
  
  if (invalidWhitelist.length > 0) {
    console.log('\n⚠️  INVALID WHITELIST - following assets in our whitelist are NOT tradable on Hyperliquid:');
    invalidWhitelist.forEach(symbol => console.log(`- ${symbol}`));
  } else {
    console.log('\n✅ All assets in our whitelist are tradable on Hyperliquid');
  }
  
  // Make recommendations for updating asset mappings
  if (invalidMappings.length > 0 || unmappedMarkets.length > 0 || invalidWhitelist.length > 0) {
    console.log('\n🔧 RECOMMENDATIONS:');
    
    if (invalidMappings.length > 0) {
      console.log('\nRemove these mappings as they are not tradable:');
      invalidMappings.forEach(symbol => {
        console.log(`  "${symbol}": "${getHyperliquidSymbol(symbol)}",`);
      });
    }
    
    if (unmappedMarkets.length > 0) {
      console.log('\nConsider adding these markets to your mappings:');
      unmappedMarkets.forEach(market => {
        console.log(`  "${market}": "${market}",`);
      });
    }
    
    if (invalidWhitelist.length > 0) {
      console.log('\nRemove these symbols from your whitelist:');
      invalidWhitelist.forEach(symbol => {
        console.log(`  "${symbol}",`);
      });
    }
  }
  
  console.log('\n=== End of Report ===\n');
}

/**
 * Fetches available markets from Hyperliquid
 */
async function getHyperliquidMarkets(): Promise<string[]> {
  try {
    // Initialize the Hyperliquid SDK - use either without privateKey (read-only)
    const sdk = new Hyperliquid({
      enableWs: false,
    });
    
    // Get meta data
    const meta = await sdk.info.perpetuals.getMeta();
    
    if (!meta || !meta.universe) {
      throw new Error('No universe data found in meta response');
    }
    
    // Extract asset names
    const assetNames = meta.universe.map((asset: any) => asset.name);
    
    return assetNames;
  } catch (error) {
    console.error('Error fetching available markets from Hyperliquid:', error);
    return [];
  }
}

// Run the script
validateAssetMappings().catch(error => {
  console.error('Error running validation script:', error);
  process.exit(1);
});