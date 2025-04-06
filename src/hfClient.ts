import { config } from './config';
import logger from './logger';
import type {
    ModelsJsonApiResponse,
    ModelInfo,
    LiveProviderInfo,
    InferenceRequestParams,
    InferenceResult,
    ProviderApiResponse,
} from './types';
import { sanitizeHeaders, headersToObject, retry, isRetryableFetchError } from './utils';

const MODELS_API_URL = 'https://huggingface.co/models-json?inference_provider=all&pipeline_tag=text-generation&sort=trending&withCount=true';

/**
 * Fetches the top trending text-generation models from the Hugging Face API.
 * FR2
 */
export async function fetchTopModels(): Promise<ModelInfo[]> {
  logger.info(`Fetching top ${config.modelsToFetch} models from ${MODELS_API_URL}`);
  try {
    const response = await fetch(MODELS_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    const data: ModelsJsonApiResponse = await response.json();

    if (!data || !Array.isArray(data.models)) {
        throw new Error("Invalid API response structure received from Models API.");
    }

    const topModels = data.models.slice(0, config.modelsToFetch);
    logger.info(`Received ${data.models.length} models, processing top ${topModels.length}.`);

    const processedModels: ModelInfo[] = topModels.map(model => {
      const liveProviders: LiveProviderInfo[] = (model.availableInferenceProviders || [])
        .filter(provider => {
            // FR2.5: Filter for live providers. Assuming 'live' status check.
            // Adjust this logic if the actual status fields differ.
            const isProviderLive = !provider.providerStatus || provider.providerStatus.toLowerCase() === 'live';
            const isModelLiveOnProvider = !provider.modelStatus || provider.modelStatus.toLowerCase() === 'live';
            return isProviderLive && isModelLiveOnProvider;
        })
        .map(provider => ({
          name: provider.name,
          providerId: provider.providerId,
        }));

      if (liveProviders.length === 0) {
          logger.warn({ modelId: model.id }, `Model has no live providers after filtering.`);
      } else {
          logger.debug({ modelId: model.id, providerCount: liveProviders.length }, `Found live providers for model.`);
      }

      return {
        id: model.id,
        liveProviders: liveProviders,
      };
    }).filter(model => model.liveProviders.length > 0); // Only keep models with at least one live provider

    logger.info(`Found ${processedModels.length} models with live providers to test.`);
    return processedModels;

  } catch (error) {
    logger.error({ error }, "Error fetching or parsing top models");
    return []; // Return empty array on error to allow the cycle to continue
  }
}

/**
 * Constructs the API URL for a given provider.
 * FR3.1.1
 */
export function constructApiUrl(providerName: string): string | null {
    const url = config.providerEndpointMapping[providerName.toLowerCase()]; // Use lowercase for case-insensitivity
    if (!url) {
        logger.warn(`No API endpoint mapping found for provider: ${providerName}`);
        return null;
    }
    return url;
}


/**
 * Builds the standard request body for inference.
 * FR3.1.3
 */
function buildRequestBody(providerModelId: string): Record<string, any> {
    return {
        messages: [
            {
                role: "user",
                content: "Solve this: 123/2*3.2*9" // Standardized prompt
            }
        ],
        max_tokens: config.maxTokensDefault,
        model: providerModelId, // Use the specific providerId
        stream: false
    };
}

/**
 * Performs a single inference call to a provider for a given model.
 * FR3.1
 */
export async function performInferenceCall(
    modelId: string,
    provider: LiveProviderInfo,
    cycleTimestampISO: string
): Promise<InferenceResult | null> {

    const apiUrl = constructApiUrl(provider.name);
    if (!apiUrl) {
        // Logged in constructApiUrl, return null to skip this provider
        return null;
    }

    const requestBody = buildRequestBody(provider.providerId);
    const requestBodyString = JSON.stringify(requestBody);

    const requestHeaders: Record<string, string> = {
        'Authorization': `Bearer ${config.hfToken}`,
        'Content-Type': 'application/json',
    };
    const sanitizedRequestHeaders = sanitizeHeaders(requestHeaders);

    let response: Response | null = null;
    let error: Error | null = null;
    let responseBodyRaw: string = '';
    let responseHeadersSanitized: Record<string, string> = {};
    let status: number = -1; // Default status for network errors etc.

    const requestStart = Date.now(); // FR3.1.2
    const requestStartISO = new Date(requestStart).toISOString();

    logger.debug({ modelId, provider: provider.name, url: apiUrl }, `Initiating inference call`);

    try {
        // Wrap the fetch call in the retry logic
        response = await retry(
            async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: requestBodyString,
                });
                // If response is not OK, throw it to be caught by retry logic
                if (!res.ok) {
                    // Throw the Response object itself to check status in isRetryableFetchError
                    throw res;
                }
                return res;
            },
            2, // retries (spec NFR2 suggests retries)
            1000, // initial delay ms
            (err) => isRetryableFetchError(err) // Check if the error is retryable
        );

        status = response.status; // FR3.1.7
        responseHeadersSanitized = sanitizeHeaders(headersToObject(response.headers)); // FR3.1.7 (Sanitize response headers too)
        responseBodyRaw = await response.text(); // FR3.1.7

    } catch (err: any) {
        logger.warn({ modelId, provider: provider.name, error: err?.message || err }, `Inference call failed`);
        error = err instanceof Error ? err : new Error(String(err));

        // If the error is an HTTP response (from fetch throwing non-ok status)
        if (err instanceof Response) {
            status = err.status;
            responseHeadersSanitized = sanitizeHeaders(headersToObject(err.headers));
            try {
                // Try to get body even from error response
                responseBodyRaw = await err.text();
            } catch (bodyError) {
                logger.warn({ modelId, provider: provider.name }, `Could not read error response body: ${bodyError}`);
                responseBodyRaw = `[Could not read error response body: ${bodyError}]`;
            }
            error = new Error(`HTTP error ${status}: ${err.statusText}`); // Create a more informative error message
        } else {
             // Network error or other exception
             status = -1; // Indicate non-HTTP error
             responseBodyRaw = `[Fetch Error: ${error.message}]`;
        }
    }

    const responseEnd = Date.now(); // FR3.1.5
    const responseEndISO = new Date(responseEnd).toISOString();
    const durationMs = responseEnd - requestStart; // FR3.1.6

    logger.info({ modelId, provider: provider.name, status, durationMs }, `Inference call completed`);

    return {
        cycleTimestampISO,
        modelId,
        providerName: provider.name,
        providerModelId: provider.providerId,
        requestUrl: apiUrl,
        requestBody: requestBodyString,
        requestHeadersSanitized: JSON.stringify(sanitizedRequestHeaders),
        requestStartISO,
        responseEndISO,
        durationMs,
        responseStatusCode: status,
        responseBodyRaw,
        responseHeadersSanitized: JSON.stringify(responseHeadersSanitized),
        errorMessage: error ? error.message : '', // FR3.1.7
    };
}
