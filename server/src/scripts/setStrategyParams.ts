import { FirestoreService, StrategyParams } from '../services/firestoreService';
import { logger } from '../utils/logger';
import { initializeFirebase } from './firebaseInit';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
try {
  initializeFirebase();
} catch (error) {
  logger.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

async function setStrategyParams() {
  try {
    logger.info('Setting strategy parameters directly in Firestore...');
    
    // Create Firestore service
    const firestoreService = new FirestoreService();
    
    // Define the new parameters to set
    const newParams: StrategyParams = {
      tradeSizePercent: 0.5,        // 50% of available margin per trade
      maxPositions: 4,              // Maximum of 4 positions (2 pair trades)
      correlationThreshold: 0.95,   // Minimum correlation of 0.95
      zScoreThreshold: 2.5,         // Z-score threshold of 2.5
      maxPortfolioAllocation: 0.5   // Maximum 50% portfolio allocation
    };
    
    // Update the parameters in Firestore
    await firestoreService.updateStrategyParams(newParams);
    
    logger.info('Successfully updated strategy parameters:');
    logger.info(JSON.stringify(newParams, null, 2));
    
    // Get the parameters to verify
    const updatedParams = await firestoreService.getStrategyParams();
    logger.info('Verified parameters from Firestore:');
    logger.info(JSON.stringify(updatedParams, null, 2));
    
  } catch (error) {
    logger.error('Error setting strategy parameters:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the function
setStrategyParams();