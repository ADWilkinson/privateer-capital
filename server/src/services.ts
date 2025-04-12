import dotenv from "dotenv";
import { CorrelationAnalyzer } from "./analysis/correlationAnalyzer";
import { HyperliquidExecutor } from "./execution/hyperliquidExecutor";
import { PositionManager } from "./execution/positionManager";
import { PairsCorrelationStrategy } from "./strategies/pairsCorrelationStrategy";
import { FirestoreService } from "./services/firestoreService";
import { PriceDataService } from "./services/priceDataService";
import { logger } from "./utils/logger";

// Load environment variables based on environment
dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

/**
 * Interface for the services returned by initServices
 */
export interface ServiceContainer {
  firestoreService: FirestoreService;
  executor: HyperliquidExecutor;
  positionManager: PositionManager;
  correlationAnalyzer: CorrelationAnalyzer;
  pairsStrategy: PairsCorrelationStrategy;
  priceDataService: PriceDataService;
}

// Singleton instances of services
let serviceContainer: ServiceContainer | null = null;

/**
 * Initialize individual service with error handling
 * @param name Service name for logging
 * @param initializer Function to initialize the service
 * @returns Initialized service
 */
function initializeService<T>(name: string, initializer: () => T): T {
  try {
    logger.debug(`Initializing ${name}...`);
    const service = initializer();
    logger.debug(`${name} initialized successfully`);
    return service;
  } catch (error) {
    logger.error(`Failed to initialize ${name}:`, error);
    throw new Error(`Failed to initialize ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initialize all required services
 * @param forceReinitialize Whether to force reinitialization even if services were already initialized
 * @returns Container with all initialized services
 */
export function initServices(forceReinitialize = false): ServiceContainer {
  // Return existing services if available and reinitialization not forced
  if (serviceContainer && !forceReinitialize) {
    return serviceContainer;
  }

  logger.info("Initializing services...");

  try {
    // Initialize Firestore service
    const firestoreService = initializeService("FirestoreService", () => new FirestoreService());

    // Initialize price data service (depends on FirestoreService)
    const priceDataService = initializeService("PriceDataService", () => new PriceDataService(firestoreService));

    // Initialize Hyperliquid executor (depends on FirestoreService)
    const executor = initializeService("HyperliquidExecutor", () => new HyperliquidExecutor(firestoreService));

    // Initialize position manager (depends on Executor and FirestoreService)
    const positionManager = initializeService("PositionManager", () => new PositionManager(executor, firestoreService));

    // Initialize correlation analyzer (depends on FirestoreService and PriceDataService)
    const correlationAnalyzer = initializeService(
      "CorrelationAnalyzer",
      () => new CorrelationAnalyzer(firestoreService, priceDataService)
    );

    // Initialize pairs strategy (depends on all other services)
    const pairsStrategy = initializeService(
      "PairsCorrelationStrategy",
      () =>
        new PairsCorrelationStrategy(correlationAnalyzer, executor, positionManager, firestoreService, priceDataService)
    );

    // Create service container
    serviceContainer = {
      firestoreService,
      executor,
      positionManager,
      correlationAnalyzer,
      pairsStrategy,
      priceDataService,
    };

    logger.info("All services initialized successfully");
    return serviceContainer;
  } catch (error) {
    logger.error("Error initializing services:", error);

    // Clean up any partially initialized services
    serviceContainer = null;

    // Throw a detailed error
    throw new Error(`Failed to initialize services: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reset all services (primarily for testing)
 */
export function resetServices(): void {
  serviceContainer = null;
  logger.debug("Services have been reset");
}
