import { logger } from "../utils/logger";
import { isWhitelisted, coinGeckoIds } from "../utils/assetMappings";

async function testWhitelist() {
  try {
    logger.info("Starting whitelist test...");

    // Test with numeric indices
    logger.info("\nTesting with numeric indices:");
    for (let i = 0; i < 20; i++) {
      const result = isWhitelisted(i);
      logger.info(`Index ${i}: ${result ? "WHITELISTED" : "NOT WHITELISTED"}`);
    }

    // Test with symbol strings
    logger.info("\nTesting with symbol strings:");
    for (const [symbol, _] of Object.entries(coinGeckoIds)) {
      const result = isWhitelisted(symbol);
      logger.info(`Symbol ${symbol}: ${result ? "WHITELISTED" : "NOT WHITELISTED"}`);
    }

    // Test with invalid inputs
    logger.info("\nTesting with invalid inputs:");
    const testCases = ["INVALID", "ETH-PERP", -1, 999, ""];
    for (const testCase of testCases) {
      const result = isWhitelisted(testCase);
      logger.info(`Input ${testCase}: ${result ? "WHITELISTED" : "NOT WHITELISTED"}`);
    }

    logger.info("Whitelist test completed successfully");
  } catch (error) {
    logger.error("Error in whitelist test:", error);
    process.exit(1);
  }
  process.exit(0);
}

testWhitelist();
