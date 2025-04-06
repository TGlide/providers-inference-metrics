import { uploadFile } from '@huggingface/hub';
import { config } from './config';
import logger from './logger';
import { readCsvBuffer, clearCsvBuffer } from './csvHandler';

/**
 * Uploads the content of the local CSV buffer to Hugging Face Hub.
 * FR4.3, FR4.4, FR4.5
 */
export async function uploadCsvToHub(): Promise<boolean> {
    logger.info(`Attempting to upload CSV buffer to HF Hub dataset: ${config.hfDatasetRepoId}`);

    const csvContent = await readCsvBuffer();

    if (!csvContent) {
        logger.info("CSV buffer is empty or could not be read. Skipping upload.");
        return false; // Indicate nothing was uploaded
    }

    try {
        // Create a Blob from the CSV content string
        // Bun's fetch Blob works directly with strings
        const fileBlob = new Blob([csvContent], { type: "text/csv" });

        const repoInfo = {
            type: "dataset" as const, // Required type assertion
            name: config.hfDatasetRepoId,
        };
        const filePath = config.hfDatasetTargetFilename;
        const commitTitle = `Automated metrics upload ${new Date().toISOString()}`;
        const commitDescription = `Upload metrics data collected up to ${new Date().toISOString()}.`;

        logger.info(`Uploading ${filePath} (${(fileBlob.size / 1024).toFixed(2)} KB) to ${repoInfo.name}...`);

        const uploadResult = await uploadFile({
            repo: repoInfo,
            accessToken: config.hfHubToken, // Use the dedicated Hub token
            file: {
                path: filePath,
                content: fileBlob,
            },
            commitTitle: commitTitle,
            commitDescription: commitDescription,
            // Consider adding 'commitAuthor' or 'commitCommitter' if needed
        });

        logger.info({ commitUrl: uploadResult.commitUrl }, `Successfully uploaded CSV to Hugging Face Hub.`);

        // Clear the buffer ONLY after successful upload (FR4.6)
        await clearCsvBuffer();
        return true; // Indicate successful upload and clear

    } catch (error) {
        logger.error({ error }, `Failed to upload CSV to Hugging Face Hub repository ${config.hfDatasetRepoId}`);
        // DO NOT clear the buffer on failure (FR4.5)
        return false; // Indicate upload failure
    }
}
