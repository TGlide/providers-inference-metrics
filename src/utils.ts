import logger from './logger';

/**
 * Masks or removes sensitive headers, specifically Authorization.
 * @param headers - Original headers object.
 * @returns Sanitized headers object.
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const key in headers) {
    if (key.toLowerCase() === 'authorization') {
      sanitized[key] = 'Bearer [MASKED]'; // Mask the token
      // Or omit entirely: continue;
    } else {
      sanitized[key] = headers[key];
    }
  }
  return sanitized;
}

/**
 * Converts Headers object to a plain Record<string, string>.
 */
export function headersToObject(headers: Headers): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}


/**
 * Simple delay function.
 * @param ms - Milliseconds to delay.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Basic retry wrapper for async functions.
 * @param fn - The async function to retry.
 * @param retries - Maximum number of retries.
 * @param delayMs - Delay between retries in milliseconds.
 * @param retryableErrorCheck - Function to check if an error is retryable.
 * @returns The result of the function if successful.
 * @throws The last error if all retries fail.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 2,
  delayMs: number = 1000,
  retryableErrorCheck: (error: any) => boolean = () => true // Default: retry all errors
): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (retryableErrorCheck(error) && i < retries) {
        logger.warn(`Attempt ${i + 1} failed. Retrying in ${delayMs}ms... Error: ${error instanceof Error ? error.message : String(error)}`);
        await delay(delayMs);
        delayMs *= 2; // Optional: Exponential backoff
      } else {
        logger.error(`Attempt ${i + 1} failed. No more retries or error not retryable. Error: ${error instanceof Error ? error.message : String(error)}`);
        throw lastError; // Throw the last encountered error
      }
    }
  }
  // This line should theoretically be unreachable due to the throw in the loop
  throw lastError;
}

/**
 * Checks if an error from fetch indicates a potentially retryable network or server issue.
 * @param error - The error object (can be Response or other Error).
 * @returns True if the error suggests a retry might help.
 */
export function isRetryableFetchError(error: any): boolean {
    if (error instanceof Response) {
        // Retry on server errors (5xx)
        return error.status >= 500 && error.status <= 599;
    }
    // Retry on network errors (TypeError often indicates network issues in fetch)
    // This might need refinement based on specific errors encountered
    if (error instanceof TypeError) {
        logger.debug("Retryable TypeError detected (potential network issue)");
        return true;
    }
    // Add other specific error types if needed
    // e.g., if (error.code === 'ECONNRESET') return true;
    return false;
}
