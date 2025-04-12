/**
 * Formats a number with commas and specified decimal places
 * @param num The number to format
 * @param decimals The number of decimal places
 * @returns Formatted number as string
 */
export function formatNumber(num: number | undefined | null, decimals: number = 2): string {
  if (num === undefined || num === null || isNaN(num)) return 'N/A';
  
  return num.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
}

/**
 * Formats a number as currency
 * @param num The number to format
 * @param currency The currency symbol (default: $)
 * @param decimals The number of decimal places
 * @returns Formatted currency as string
 */
export function formatCurrency(
  num: number | undefined | null, 
  currency: string = '$', 
  decimals: number = 2
): string {
  if (num === undefined || num === null || isNaN(num)) return 'N/A';
  
  const formatted = formatNumber(num, decimals);
  return `${currency}${formatted}`;
}

/**
 * Formats a percentage value
 * @param num The number to format (0.1 = 10%)
 * @param decimals The number of decimal places
 * @returns Formatted percentage as string
 */
export function formatPercent(num: number | undefined | null, decimals: number = 1): string {
  if (num === undefined || num === null || isNaN(num)) return 'N/A';
  
  return `${(num * 100).toFixed(decimals)}%`;
}

/**
 * Formats a timestamp into a readable date/time string
 * @param timestamp Timestamp in milliseconds
 * @param options Format options
 * @returns Formatted date string
 */
export function formatTimestamp(
  timestamp: number | undefined | null,
  options: { dateOnly?: boolean, timeOnly?: boolean } = {}
): string {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp);
  
  if (options.dateOnly) {
    return date.toLocaleDateString();
  }
  
  if (options.timeOnly) {
    return date.toLocaleTimeString();
  }
  
  return date.toLocaleString();
}

/**
 * Formats a duration in milliseconds into a human-readable string
 * @param ms Duration in milliseconds
 * @returns Formatted duration string (e.g., "2h 15m" or "30s")
 */
export function formatDuration(ms: number | undefined | null): string {
  if (!ms) return 'N/A';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  
  return `${seconds}s`;
}