import { FirestoreService } from '../services/firestoreService';
import { PriceDataService } from '../services/priceDataService';
import { logger } from '../utils/logger';
import { coinGeckoIds } from '../utils/assetMappings';
import dotenv from 'dotenv';
import { initializeFirebase } from './firebaseInit';
import axios from 'axios';

dotenv.config();

// Initialize Firebase Admin SDK
try {
  initializeFirebase();
} catch (error) {
  logger.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

// Create a direct axios instance for debugging
const debugApiClient = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || ''
  }
});

// Create services
const firestoreService = new FirestoreService();
const priceDataService = new PriceDataService(firestoreService);

/**
 * Debug function to test direct CoinGecko API access
 */
async function testDirectCoinGeckoAccess() {
  try {
    logger.info('Testing direct CoinGecko API access...');
    
    // Get list of CoinGecko IDs
    const coinGeckoIdsToFetch = Object.values(coinGeckoIds);
    logger.info(`CoinGecko IDs to fetch: ${coinGeckoIdsToFetch.join(', ')}`);
    
    // Build the API request URL with all IDs
    const idsParam = coinGeckoIdsToFetch.join(',');
    const endpoint = `/simple/price?ids=${idsParam}&vs_currencies=usd&precision=full`;
    
    logger.info(`Making direct request to CoinGecko: ${endpoint}`);
    
    // Make the API request
    const response = await debugApiClient.get(endpoint);
    
    logger.info(`CoinGecko API response status: ${response.status}`);
    logger.info(`CoinGecko API response headers: ${JSON.stringify(response.headers)}`);
    
    if (response.data) {
      logger.info(`CoinGecko API response data: ${JSON.stringify(response.data, null, 2)}`);
      
      // Count the number of assets returned
      const assetsReturned = Object.keys(response.data).length;
      logger.info(`Number of assets returned: ${assetsReturned} out of ${coinGeckoIdsToFetch.length} requested`);
      
      // Check if we have prices for each asset
      for (const [coinGeckoId, priceData] of Object.entries(response.data)) {
        if (priceData && (priceData as any).usd) {
          logger.info(`${coinGeckoId}: $${(priceData as any).usd}`);
        } else {
          logger.warn(`No USD price found for ${coinGeckoId}`);
        }
      }
    } else {
      logger.warn('No data returned from CoinGecko API');
    }
  } catch (error: any) {
    logger.error('Error testing direct CoinGecko API access:', error);
    
    if (error.response) {
      logger.error(`Status: ${error.response.status}`);
      logger.error(`Headers: ${JSON.stringify(error.response.headers)}`);
      logger.error(`Data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error('No response received from server');
    } else {
      logger.error(`Error message: ${error.message}`);
    }
  }
}

/**
 * Debug function to test the PriceDataService
 */
async function testPriceDataService() {
  try {
    logger.info('Testing PriceDataService.collectAndStorePriceSnapshots()...');
    
    // Get the whitelisted assets
    const whitelistedAssets = Object.keys(coinGeckoIds);
    logger.info(`Whitelisted assets: ${whitelistedAssets.join(', ')}`);
    
    // Call the service method
    const prices = await priceDataService.collectAndStorePriceSnapshots();
    
    // Check the results
    if (Object.keys(prices).length > 0) {
      logger.info(`Successfully collected prices for ${Object.keys(prices).length} assets`);
      logger.info(`Price data: ${JSON.stringify(prices, null, 2)}`);
    } else {
      logger.warn('No prices were collected');
    }
    
    // Check Firestore for the latest snapshot
    const lastSnapshotQuery = firestoreService.getCollection('priceSnapshots')
      .orderBy('timestamp', 'desc')
      .limit(1);
    
    const snapshot = await lastSnapshotQuery.get();
    
    if (!snapshot.empty) {
      const snapshotData = snapshot.docs[0].data();
      logger.info(`Latest price snapshot in Firestore: ${JSON.stringify(snapshotData, null, 2)}`);
    } else {
      logger.warn('No price snapshots found in Firestore');
    }
  } catch (error) {
    logger.error('Error testing PriceDataService:', error);
  }
}

/**
 * Main debug function
 */
async function debugPriceData() {
  try {
    logger.info('Starting price data debugging...');
    
    // Test direct CoinGecko API access
    await testDirectCoinGeckoAccess();
    
    // Test the PriceDataService
    await testPriceDataService();
    
    logger.info('Price data debugging completed');
  } catch (error) {
    logger.error('Error in price data debugging:', error);
  } finally {
    process.exit(0);
  }
}

// Run the debug function
debugPriceData();
