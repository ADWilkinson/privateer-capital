import { logger } from "../utils/logger";

/**
 * Retry an operation with exponential backoff
 * @param operation Function to retry
 * @param maxRetries Maximum number of retries
 * @returns Result of the operation
 */
export async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
      logger.warn(`Operation failed, retrying in ${delay}ms (${i + 1}/${maxRetries})`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
