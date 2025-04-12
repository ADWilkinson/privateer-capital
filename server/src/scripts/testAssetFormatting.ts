import { HyperliquidExecutor } from "../execution/hyperliquidExecutor";
import { FirestoreService } from "../services/firestoreService";
import { logger } from "../utils/logger";
import { coinGeckoIds } from "../utils/assetMappings";

// Initialize Firebase Admin SDK (required for HyperliquidExecutor)
import { initializeFirebase } from "./firebaseInit";
import dotenv from 'dotenv';

dotenv.config();

// Set environment variables directly for testing
process.env.HYPERLIQUID_MAIN_WALLET_ADDRESS = "";
process.env.HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY = "";

// Initialize Firebase Admin SDK
try {
  initializeFirebase();
} catch (error) {
  logger.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

// Create services
const firestoreService = new FirestoreService();
const executor = new HyperliquidExecutor(firestoreService);

function getHyperliquidSymbol(asset: string): string {
  // Extract the base asset name (without -PERP)
  return asset.replace(/-PERP$/, '').toUpperCase();
}

async function testAssetFormatting(): Promise<void> {
  try {
    // Initialize the executor without throwing errors
    await executor.initialize();
    
    // Get all tradable assets from Hyperliquid
    const assets = await executor.getTradableAssets();
    
    logger.info(`Found ${assets.length} tradable assets`);
    
    // Log the first 10 assets to see their format
    logger.info('First 10 assets from Hyperliquid:', assets.slice(0, 10));
    
    // Check how our whitelist is formatted
    const whitelist = Object.keys(coinGeckoIds);
    logger.info('Whitelist assets:', whitelist);
    
    // Check which assets match our whitelist
    const matchedAssets = assets.filter((asset: string) => {
      const baseAsset = getHyperliquidSymbol(asset);
      return whitelist.includes(baseAsset);
    });
    
    logger.info(`Number of assets matching whitelist: ${matchedAssets.length}`);
    logger.info('Matched assets:', matchedAssets);
    
    // Check the first non-matching asset to see why it's not matching
    const firstNonMatchingAsset = assets.find((asset: string) => {
      const baseAsset = getHyperliquidSymbol(asset);
      return !whitelist.includes(baseAsset);
    });
    
    if (firstNonMatchingAsset) {
      logger.info('First non-matching asset:', firstNonMatchingAsset);
      const baseAsset = getHyperliquidSymbol(firstNonMatchingAsset);
      logger.info('Base asset:', baseAsset);
    }
    
  } catch (error) {
    logger.error('Error in test script:', error);
    process.exit(1);
  }
}

testAssetFormatting();
