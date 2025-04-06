import fs from 'fs/promises'; // Use promises for async operations
import path from 'path';
import { stringify } from 'csv-stringify/sync'; // Using csv-stringify for robust CSV generation
import { parse } from 'papaparse'; // Using papaparse for reading potentially existing headers
import type { InferenceResult, CsvRow } from './types';
import { config } from './config';
import logger from './logger';

const CSV_HEADER: CsvRow = [
    'cycle_timestamp_iso', 'model_id', 'provider_name', 'provider_model_id',
    'request_url', 'request_body', 'request_headers_sanitized',
    'request_start_iso', 'response_end_iso', 'duration_ms',
    'response_status_code', 'response_body_raw', 'response_headers_sanitized',
    'error_message'
];

/**
 * Ensures the CSV buffer file exists and has the correct header.
 */
async function ensureCsvHeader(): Promise<void> {
    try {
        await fs.access(config.localCsvPath);
        // File exists, check header (optional but good practice)
        // Simple check: read first line. More robust: use a CSV parser.
        const content = await fs.readFile(config.localCsvPath, 'utf-8');
        if (!content.trim() || !content.startsWith(CSV_HEADER.join(','))) {
             logger.warn(`CSV file ${config.localCsvPath} exists but has missing/incorrect header. Rewriting header.`);
             const headerString = stringify([CSV_HEADER]);
             await fs.writeFile(config.localCsvPath, headerString);
        }

    } catch (error: any) {
        // File doesn't exist or other access error
        if (error.code === 'ENOENT') {
            logger.info(`CSV buffer file ${config.localCsvPath} not found. Creating with header.`);
            const headerString = stringify([CSV_HEADER]);
            await fs.writeFile(config.localCsvPath, headerString);
        } else {
            logger.error({ error }, `Error accessing CSV buffer file ${config.localCsvPath}`);
            throw error; // Re-throw unexpected errors
        }
    }
}

/**
 * Formats an InferenceResult into a CsvRow array.
 * Section 11 (Test Target) & FR4.1/FR3.1.7
 */
export function formatDataForCsv(record: InferenceResult): CsvRow {
    // Order must match CSV_HEADER and spec.md Section 5
    return [
        record.cycleTimestampISO,
        record.modelId,
        record.providerName,
        record.providerModelId,
        record.requestUrl,
        record.requestBody, // Already stringified JSON
        record.requestHeadersSanitized, // Already stringified JSON
        record.requestStartISO,
        record.responseEndISO,
        record.durationMs,
        record.responseStatusCode,
        record.responseBodyRaw, // Raw text/JSON string
        record.responseHeadersSanitized, // Already stringified JSON
        record.errorMessage,
    ];
}

/**
 * Appends multiple formatted CSV rows to the local buffer file.
 * FR4.2
 * @param results - Array of InferenceResult objects.
 */
export async function appendResultsToCsvBuffer(results: InferenceResult[]): Promise<void> {
    if (results.length === 0) {
        logger.debug("No results to append to CSV buffer.");
        return;
    }

    logger.info(`Appending ${results.length} results to ${config.localCsvPath}`);
    try {
        await ensureCsvHeader(); // Make sure file and header exist

        const rows: CsvRow[] = results.map(formatDataForCsv);
        const csvString = stringify(rows); // Convert rows to CSV string (without header)

        await fs.appendFile(config.localCsvPath, csvString);
        logger.debug(`Successfully appended ${results.length} rows.`);

    } catch (error) {
        logger.error({ error }, `Failed to append data to CSV buffer ${config.localCsvPath}`);
        // Decide on error handling: maybe buffer in memory? For now, just log.
        // Re-throwing might stop the whole process, which might not be desired.
    }
}

/**
 * Reads the content of the CSV buffer file.
 */
export async function readCsvBuffer(): Promise<string | null> {
    try {
        // Check if file exists before reading
        await fs.access(config.localCsvPath);
        const content = await fs.readFile(config.localCsvPath, 'utf-8');
        // Basic check: return null if file is empty or only contains the header
        const lines = content.trim().split('\n');
        if (lines.length <= 1 && lines[0].trim() === CSV_HEADER.join(',')) {
            logger.info("CSV buffer contains only the header or is empty. Nothing to upload.");
            return null;
        }
        return content;
    } catch (error: any) {
         if (error.code === 'ENOENT') {
            logger.warn(`CSV buffer file ${config.localCsvPath} not found during read. Nothing to upload.`);
            return null; // File doesn't exist, nothing to read
        }
        logger.error({ error }, `Failed to read CSV buffer file ${config.localCsvPath}`);
        return null; // Return null on other errors to prevent upload attempt
    }
}


/**
 * Clears the CSV buffer file by writing only the header back.
 * FR4.6
 */
export async function clearCsvBuffer(): Promise<void> {
    logger.info(`Clearing CSV buffer file ${config.localCsvPath} (writing header).`);
    try {
        const headerString = stringify([CSV_HEADER]);
        await fs.writeFile(config.localCsvPath, headerString);
        logger.debug(`CSV buffer cleared successfully.`);
    } catch (error) {
        logger.error({ error }, `Failed to clear CSV buffer file ${config.localCsvPath}`);
        // This is more critical - if clearing fails after upload, data might be duplicated.
        // Consider more robust error handling/alerting here.
        throw error; // Re-throw to signal the issue
    }
}
