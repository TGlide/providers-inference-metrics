import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import type { AppConfig } from './types';

// Load .env file
dotenv.config();

function loadJsonMapping(filePath: string): Record<string, string> {
  try {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`Warning: Provider mapping file not found at ${absolutePath}. Using empty mapping.`);
      return {};
    }
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error loading provider mapping from ${filePath}:`, error);
    // Depending on severity, you might want to throw or exit
    return {}; // Return empty mapping on error
  }
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvVarAsInt(key: string, defaultValue?: number): number {
    const valueStr = getEnvVar(key, defaultValue?.toString());
    const valueInt = parseInt(valueStr, 10);
    if (isNaN(valueInt)) {
        throw new Error(`Invalid integer value for environment variable ${key}: ${valueStr}`);
    }
    return valueInt;
}


const providerMappingPath = getEnvVar('PROVIDER_ENDPOINT_MAPPING_PATH', './provider_mapping.json');

export const config: AppConfig = {
  hfToken: getEnvVar('HF_TOKEN'),
  hfHubToken: getEnvVar('HF_HUB_TOKEN'),
  hfDatasetRepoId: getEnvVar('HF_DATASET_REPO_ID'),
  hfDatasetTargetFilename: getEnvVar('HF_DATASET_TARGET_FILENAME', 'metrics.csv'),
  scheduleIntervalSeconds: getEnvVarAsInt('SCHEDULE_INTERVAL_SECONDS', 1800), // Default to 30 minutes
  modelsToFetch: getEnvVarAsInt('MODELS_TO_FETCH', 5),
  maxTokensDefault: getEnvVarAsInt('MAX_TOKENS_DEFAULT', 4096), // Default set to 4096
  providerEndpointMappingPath: providerMappingPath,
  localCsvPath: getEnvVar('LOCAL_CSV_PATH', './metrics_buffer.csv'),
  pushIntervalCycles: getEnvVarAsInt('PUSH_INTERVAL_CYCLES', 6),
  logLevel: getEnvVar('LOG_LEVEL', 'info').toLowerCase(),
  providerEndpointMapping: loadJsonMapping(providerMappingPath),
};

// Basic validation
if (config.scheduleIntervalSeconds <= 0) {
    throw new Error("SCHEDULE_INTERVAL_SECONDS must be positive.");
}
if (config.modelsToFetch <= 0) {
    throw new Error("MODELS_TO_FETCH must be positive.");
}
if (config.pushIntervalCycles <= 0) {
    throw new Error("PUSH_INTERVAL_CYCLES must be positive.");
}

console.log("Configuration loaded successfully."); // Simple confirmation
