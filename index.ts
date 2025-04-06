import { config } from './src/config';
import logger from './src/logger';
import { fetchTopModels, performInferenceCall } from './src/hfClient';
import { appendResultsToCsvBuffer } from './src/csvHandler';
import { uploadCsvToHub } from './src/hubUploader';
import type { InferenceResult } from './src/types';

let cycleCounter = 0;
let isRunning = false; // Prevent overlapping runs
let intervalId: Timer | null = null; // Store interval timer

async function runCycle() {
    if (isRunning) {
        logger.warn("Previous cycle still running. Skipping this interval.");
        return;
    }
    isRunning = true;
    cycleCounter++;
    const cycleStartTime = new Date();
    const cycleTimestampISO = cycleStartTime.toISOString();
    logger.info(`Starting cycle ${cycleCounter} at ${cycleTimestampISO}`);

    const cycleResults: InferenceResult[] = [];

    try {
        // 1. Fetch Top Models (FR2)
        const modelsToTest = await fetchTopModels();

        if (modelsToTest.length === 0) {
            logger.warn("No models found or fetched. Skipping inference calls for this cycle.");
        } else {
             // 2. Perform Inference Calls (FR3)
            logger.info(`Processing ${modelsToTest.length} models...`);
            // Use Promise.allSettled for concurrency (NFR1)
            const allProviderPromises = modelsToTest.flatMap(model =>
                model.liveProviders.map(provider =>
                    performInferenceCall(model.id, provider, cycleTimestampISO)
                        .catch(err => {
                            // Catch errors within performInferenceCall itself if possible,
                            // but have a safety net here.
                            logger.error({ modelId: model.id, provider: provider.name, error: err },
                                `Unhandled error during inference call for provider.`);
                            return null; // Ensure it resolves to null on unexpected error
                        })
                )
            );

            const settledResults = await Promise.allSettled(allProviderPromises);

            settledResults.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    cycleResults.push(result.value);
                } else if (result.status === 'rejected') {
                    // This case should ideally be handled within performInferenceCall's try/catch
                    logger.error({ reason: result.reason }, "A provider promise was rejected unexpectedly.");
                }
                // Null fulfilled values (e.g., no API URL) are ignored here
            });
            logger.info(`Completed ${cycleResults.length} inference calls for cycle ${cycleCounter}.`);
        }


        // 3. Persist Data Locally (FR4.2)
        if (cycleResults.length > 0) {
            await appendResultsToCsvBuffer(cycleResults);
        } else {
            logger.info("No successful inference results to append in this cycle.");
        }

        // 4. Check if it's time to push to Hub (FR4.3)
        if (cycleCounter % config.pushIntervalCycles === 0) {
            logger.info(`Push interval reached (cycle ${cycleCounter}). Attempting upload to HF Hub.`);
            await uploadCsvToHub(); // Errors handled within the function
        }

    } catch (error) {
        // Catch errors from fetching models or appending CSV (critical parts)
        logger.error({ error, cycle: cycleCounter }, "Critical error during execution cycle");
        // Depending on the error, you might want to stop the process
        // For now, we log and let the next cycle run
    } finally {
        const cycleEndTime = new Date();
        const cycleDuration = cycleEndTime.getTime() - cycleStartTime.getTime();
        logger.info(`Finished cycle ${cycleCounter} in ${cycleDuration}ms.`);
        isRunning = false;
    }
}

// --- Scheduler (FR1) & Main Execution ---

function startScheduler() {
    logger.info(`Starting scheduler. Interval: ${config.scheduleIntervalSeconds} seconds.`);
    // Run first cycle immediately
    runCycle().catch(err => logger.fatal({ error: err }, "Unhandled error during initial runCycle"));

    // Schedule subsequent runs
    intervalId = setInterval(() => {
        runCycle().catch(err => logger.fatal({ error: err }, "Unhandled error during scheduled runCycle"));
    }, config.scheduleIntervalSeconds * 1000);
}

// --- Graceful Shutdown (Section 10) ---
async function shutdown(signal: string) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    if (intervalId) {
        clearInterval(intervalId);
        logger.info("Scheduler stopped.");
    }

    // Optional: Attempt one final upload before exiting if needed
    // Be cautious about long operations during shutdown
    if (!isRunning) { // Only attempt upload if no cycle is currently running
        logger.info("Attempting final data upload before exit...");
        try {
            await uploadCsvToHub();
        } catch (uploadError) {
            logger.error({ error: uploadError }, "Error during final data upload.");
        }
    } else {
        logger.warn("A cycle is currently running. Skipping final upload to avoid conflicts.");
    }


    logger.info("Shutdown complete. Exiting.");
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// --- Start the application ---
logger.info("Application starting...");
startScheduler();

// Keep process alive (though setInterval should do this)
// process.stdin.resume(); // Not strictly necessary with setInterval
