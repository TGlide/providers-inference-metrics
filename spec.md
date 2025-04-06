# Inference Providers Metrics Tracker (v2)**

**1. Overview & Goal**

*   **Purpose:** To continuously monitor the availability, performance (latency), and response consistency of various Hugging Face Inference API providers for popular text-generation models.
*   **Core Function:** Every **5 minutes**, the system will identify the top 5 trending text-generation models with available inference providers, send a standardized request to each model via each of its listed providers, and record detailed metrics and response data.
*   **Technology:** Bun runtime with TypeScript.
*   **Output:** Structured data (CSV format) containing request/response details and timings, pushed regularly to a designated Hugging Face Dataset.

**2. Functional Requirements (FR)**

*   **FR1: Scheduled Execution:**
    *   The core logic must be triggered automatically every **300 seconds (5 minutes)**.
    *   The execution timing should be reasonably accurate (minor drifts are acceptable, but it shouldn't skip intervals frequently).
*   **FR2: Fetch Top Models:**
    *   **FR2.1:** Every execution cycle, perform an HTTP GET request to:
        `https://huggingface.co/models-json?inference_provider=all&pipeline_tag=text-generation&sort=trending&withCount=true`
    *   **FR2.2:** Handle potential errors during this fetch (network issues, non-200 status codes, invalid JSON). Log errors appropriately.
    *   **FR2.3:** Parse the JSON response.
    *   **FR2.4:** Select the *first 5* model objects from the `models` array in the response. If fewer than 5 are returned, process all available ones.
    *   **FR2.5:** For each selected model, extract:
        *   `model.id` (e.g., "deepseek-ai/DeepSeek-V3-0324")
        *   `model.availableInferenceProviders` (array of objects, each containing `name` and `providerId`). Filter out any providers where `modelStatus` or `providerStatus` is not "live".
*   **FR3: Perform Inference Calls:**
    *   **FR3.1:** For each of the top models identified in FR2:
        *   Iterate through its *live* `availableInferenceProviders`.
        *   For each provider (`provider.name`, `provider.providerId`):
            *   **FR3.1.1:** Construct the target API endpoint URL. This requires a mapping from `provider.name` to the correct path structure on `https://router.huggingface.co/`.
                *   *Initial Mapping (based on examples, **needs expansion/verification for other providers via configuration - see NFR4**):*
                    *   `novita`: `https://router.huggingface.co/novita/v3/openai/chat/completions`
                    *   `sambanova`: `https://router.huggingface.co/sambanova/v1/chat/completions`
                    *   `fireworks-ai`: `https://router.huggingface.co/fireworks-ai/v1/chat/completions` (Assumption, verify)
                    *   `together`: `https://router.huggingface.co/together/v1/chat/completions` (Assumption, verify)
                    *   `hf-inference`: `https://router.huggingface.co/hf-inference/v1/chat/completions` (Assumption, verify)
                    *   ... (This mapping needs to be configurable and easily updatable).
            *   **FR3.1.2:** Record `request_start_time` (high-resolution timestamp, e.g., `performance.now()` or `Date.now()`) immediately before sending the request.
            *   **FR3.1.3:** Send an HTTP POST request using `fetch`:
                *   **URL:** As constructed in FR3.1.1.
                *   **Headers:**
                    *   `Authorization: Bearer ${process.env.HF_TOKEN}` (Ensure `HF_TOKEN` is loaded from environment variables).
                    *   `Content-Type: application/json`
                *   **Body (JSON Stringified):**
                    ```json
                    {
                        "messages": [
                            {
                                "role": "user",
                                "content": "Solve this: 123/2*3.2*9"
                            }
                        ],
                        "max_tokens": 512, // Configurable default (NFR4)
                        "model": "{provider.providerId}", // Use the specific providerId for the model
                        "stream": false
                    }
                    ```
            *   **FR3.1.4:** Await the response.
            *   **FR3.1.5:** Record `response_end_time` (high-resolution timestamp) immediately after the response (or error) is fully received.
            *   **FR3.1.6:** Calculate `duration_ms = response_end_time - request_start_time`.
            *   **FR3.1.7:** Store the results (both success and failure) including:
                *   Timestamp of the check cycle start.
                *   Model ID (`model.id`).
                *   Provider Name (`provider.name`).
                *   Provider Model ID (`provider.providerId`).
                *   Request URL.
                *   Request Body (Raw JSON string).
                *   **Request Headers (Sanitized - see FR4.7).**
                *   Response Status Code (e.g., 200, 401, 500).
                *   Response Body (Raw text/JSON string).
                *   **Response Headers (Sanitized - potentially remove sensitive info if any).**
                *   `request_start_time` (ISO 8601 format or Unix timestamp ms).
                *   `response_end_time` (ISO 8601 format or Unix timestamp ms).
                *   `duration_ms`.
                *   Error message (if any occurred during the request/response).
*   **FR4: Data Persistence:**
    *   **FR4.1:** Define a clear CSV schema (see Section 5).
    *   **FR4.2:** Append the results collected in FR3.1.7 for each provider call to a local CSV file (defined in NFR4) during each 5-minute cycle. Use a robust CSV writing library or method.
    *   **FR4.3:** Implement a mechanism to periodically (controlled by `PUSH_INTERVAL_CYCLES` in NFR4) push the contents of the local CSV buffer file to a designated Hugging Face Dataset repository.
    *   **FR4.4:** The push mechanism **must** use the `@huggingface/hub` library's `uploadFile` function.
        *   It requires a Hugging Face Hub token (`HF_HUB_TOKEN` environment variable) with `write` permissions for the target dataset repository (`HF_DATASET_REPO_ID` environment variable).
        *   The local CSV file content must be read (e.g., using `readFileSync` or `Bun.file().arrayBuffer()`).
        *   A `Blob` object must be created from the file content buffer (`new Blob([buffer], { type: "text/csv" })`).
        *   The `uploadFile` function must be called with:
            *   `repo`: `{ type: "dataset", name: process.env.HF_DATASET_REPO_ID }`
            *   `accessToken`: `process.env.HF_HUB_TOKEN`
            *   `file`: `{ path: process.env.HF_DATASET_TARGET_FILENAME, content: fileBlob }`
            *   Optional but recommended: `commitTitle`, `commitDescription` providing context (e.g., "Automated metrics upload [timestamp]").
    *   **FR4.5:** Strategy for pushing: Append new data. The script should read the local buffer CSV, upload it, and then clear the local buffer CSV upon successful upload. This ensures only new data since the last push is uploaded in each batch. Error handling during the push should prevent clearing the buffer, allowing a retry on the next push interval.
    *   **FR4.6:** Clear the local CSV buffer file *only* after a successful push to Hugging Face Hub.
    *   **FR4.7: Prevent Token Leakage:** The process of preparing data for the CSV **must** ensure that the `HF_TOKEN` used for inference API calls is **never** written to the CSV file. Specifically, when logging request headers (FR3.1.7), the `Authorization` header's value **must be masked or omitted entirely**. Logged response headers should also be reviewed for any potentially sensitive information before saving.

**3. Non-Functional Requirements (NFR)**

*   **NFR1: Scalability:**
    *   The system should handle making multiple API calls concurrently within each cycle (e.g., using `Promise.allSettled` for the provider calls for a given model) to fit within the **5-minute** window.
    *   Be mindful of potential rate limits on the Hugging Face Router API. Implement respectful delays or concurrency limits if needed.
*   **NFR2: Reliability:**
    *   The scheduler should be robust.
    *   Individual API call failures (timeouts, 5xx errors) should not crash the entire process. Log errors and continue with the next call/cycle.
    *   Implement retries with exponential backoff for transient network errors or specific server errors (e.g., 503 Service Unavailable) on inference calls.
*   **NFR3: Maintainability:**
    *   Code should be modular (e.g., separate functions/modules for fetching models, making inference calls, writing CSV, pushing to HF Hub).
    *   Use TypeScript effectively with clear interfaces/types for API responses and internal data structures.
    *   Include comments for complex logic.
    *   Use a linter (ESLint) and formatter (Prettier) for consistent code style.
*   **NFR4: Configurability:**
    *   Key parameters should be configurable via environment variables or a configuration file (`.env` preferred for secrets):
        *   `HF_TOKEN` (for inference API calls - **SECRET**)
        *   `HF_HUB_TOKEN` (for pushing to dataset - **SECRET**)
        *   `HF_DATASET_REPO_ID` (e.g., "YourUsername/inference-metrics")
        *   `HF_DATASET_TARGET_FILENAME` (e.g., "metrics.csv")
        *   `SCHEDULE_INTERVAL_SECONDS` (default: **300**)
        *   `MODELS_TO_FETCH` (default: 5)
        *   `MAX_TOKENS_DEFAULT` (default: 512)
        *   `PROVIDER_ENDPOINT_MAPPING_PATH` (Path to a JSON/TS file defining the mapping in FR3.1.1)
        *   `LOCAL_CSV_PATH` (default: "./metrics_buffer.csv")
        *   `PUSH_INTERVAL_CYCLES` (default: **6** - push every 6 cycles = 30 minutes)
        *   `LOG_LEVEL` (e.g., 'info', 'debug', 'warn', 'error', default: 'info')
*   **NFR5: Observability:**
    *   Implement structured logging (e.g., using Pino) respecting `LOG_LEVEL`. Record key events:
        *   Cycle start/end.
        *   Models fetched (count, IDs).
        *   Number of provider calls initiated.
        *   Success/failure count for provider calls.
        *   Errors encountered (fetching models, specific provider calls, CSV writing, HF Hub push).
        *   Successful data push events (including commit URL).

**4. Technical Stack**

*   **Runtime:** Bun
*   **Language:** TypeScript
*   **Key Libraries:**
    *   Built-in Bun APIs (`fetch`, `Bun.file`, timers, `Blob`)
    *   CSV parsing/writing library (e.g., `papaparse`, `csv-writer`, or simple manual implementation for appending)
    *   `@huggingface/hub` (for interacting with HF Datasets)
    *   Logging library (e.g., `pino`)
    *   Environment variable loader (e.g., `dotenv`)

**5. Data Schema (CSV Columns)**

```csv
cycle_timestamp_iso,model_id,provider_name,provider_model_id,request_url,request_body,request_headers_sanitized,request_start_iso,response_end_iso,duration_ms,response_status_code,response_body_raw,response_headers_sanitized,error_message
```

*   `cycle_timestamp_iso`: ISO 8601 timestamp when the 5-minute cycle started.
*   `model_id`: Hugging Face model ID (e.g., "deepseek-ai/DeepSeek-V3-0324").
*   `provider_name`: Name of the inference provider (e.g., "novita").
*   `provider_model_id`: The specific ID used in the API call for that provider (e.g., "deepseek/deepseek-v3-0324").
*   `request_url`: The full URL called.
*   `request_body`: The raw JSON request body sent.
*   `request_headers_sanitized`: Request headers as a JSON string, **with Authorization value masked/omitted**.
*   `request_start_iso`: ISO 8601 timestamp when the specific request was initiated.
*   `response_end_iso`: ISO 8601 timestamp when the specific response was received (or error occurred).
*   `duration_ms`: Time taken for the specific API call in milliseconds.
*   `response_status_code`: HTTP status code received (e.g., 200, 400, 503, or -1 for network errors).
*   `response_body_raw`: The raw response body as text. (Handle potential large sizes if necessary).
*   `response_headers_sanitized`: Response headers as a JSON string, reviewed for sensitive info.
*   `error_message`: Any error message captured during the request/response process (empty if successful).

**6. API Interactions Summary**

*   **Hugging Face Models API:** GET request to fetch top models. Requires no auth for this specific endpoint.
*   **Hugging Face Router API:** POST requests for inference. Requires `HF_TOKEN` Bearer authentication. Endpoint structure varies per provider.
*   **Hugging Face Hub API:** Used via `@huggingface/hub` library (`uploadFile`) to push CSV data. Requires `HF_HUB_TOKEN` with write access to the target dataset repo.

**7. Deployment & Operations**

*   The application should run as a long-running background process (e.g., using `nohup`, `pm2`, systemd, Docker).
*   Ensure required environment variables are set in the execution environment.
*   Monitor logs for errors and successful execution cycles.

**8. Error Handling Strategy**

*   **Fetch Top Models:** Log error, skip the current cycle if fetching fails.
*   **Inference Calls:**
    *   Use `try...catch` around each `fetch` call.
    *   Log specific errors (network, timeout, HTTP status codes >= 400).
    *   Record failure details in the CSV (status code, error message).
    *   Implement retry logic (e.g., 2 retries with 1s, 3s delay) for network errors and 5xx status codes before recording as a failure.
    *   Do *not* retry on 4xx client errors.
*   **CSV Writing:** Log error, potentially buffer in memory temporarily if file access fails, retry writing later. If persistent, raise a critical alert.
*   **HF Hub Push:** Log error, **do not clear the local buffer**, retry push on the next scheduled push interval (`PUSH_INTERVAL_CYCLES`).

**9. Key Challenge: Provider Endpoint Mapping**

*   The mapping from `provider.name` to the correct `/vX/.../chat/completions` path segment is critical and not fully defined by the initial examples.
*   **Action Item:** This mapping needs to be researched for all potential providers listed in the Models API response or implemented via a configuration file (`PROVIDER_ENDPOINT_MAPPING_PATH`) that can be easily updated as new providers emerge or paths change. Start with the known ones and add placeholders or error logging for unknown providers encountered.

**10. Good Practices Checklist & Tracking**

*   [ ] Use `async/await` for all I/O operations.
*   [ ] Use `Promise.allSettled` for concurrent provider calls per model.
*   [ ] Define TypeScript interfaces/types for API responses and data structures.
*   [ ] Load secrets (`HF_TOKEN`, `HF_HUB_TOKEN`) from environment variables (`process.env`).
*   [ ] Use a configuration file or environment variables for non-secret parameters.
*   [ ] Structure code into logical modules/functions.
*   [ ] Implement robust error handling with `try...catch` and specific error logging.
*   [ ] Implement retry logic for transient network/server errors.
*   [ ] Use a structured logger (e.g., Pino).
*   [ ] Use ESLint and Prettier for code quality and consistency.
*   [X] **Write unit tests *before* implementation (TDD) for key modules (see Section 11).**
*   [ ] Use Git for version control.
*   [ ] Add a `README.md` explaining setup, configuration, and how to run.
*   [ ] Document the Provider Endpoint Mapping clearly (and how to update it).
*   [ ] Implement graceful shutdown handling (e.g., on SIGTERM/SIGINT) to finish ongoing requests and push remaining data if possible.
*   [X] **Ensure sensitive data (like `HF_TOKEN`) is masked/omitted before saving to CSV (FR4.7).**

**11. Unit Testing (TDD Approach)**

*   **Goal:** Verify the correctness of individual functions/modules in isolation *before* or during their implementation. This ensures building blocks work as expected.
*   **Framework Suggestion:** Use Bun's built-in test runner (`bun test`).
*   **Key Areas for Initial Tests (Write tests first):**
    *   **`parseModelsApiResponse(apiResponse: string | object): ModelInfo[]`**:
        *   Test with valid JSON string matching the expected structure. Should return the correct number of models.
        *   Test with valid JSON but empty `models` array. Should return empty array.
        *   Test with invalid JSON string. Should throw an appropriate error or return empty array/handle gracefully based on design.
        *   Test with missing `models` key. Should handle gracefully.
    *   **`filterLiveProviders(providers: ProviderInfo[]): ProviderInfo[]`**:
        *   Test with providers all having `status: "live"`. Should return all.
        *   Test with some providers having different statuses. Should return only the "live" ones.
        *   Test with an empty input array. Should return empty array.
    *   **`constructApiUrl(providerName: string, mapping: Record<string, string>): string | null`**:
        *   Test with known provider names present in the mapping. Should return the correct URL.
        *   Test with a provider name *not* in the mapping. Should return `null` or throw an error (defined behavior).
        *   Test with an empty mapping. Should always return `null` or throw.
    *   **`buildRequestBody(providerModelId: string, prompt: string, maxTokens: number): object`**:
        *   Test with standard inputs. Should return the correct JSON object structure defined in FR3.1.3.
    *   **`sanitizeHeaders(headers: Record<string, string>): Record<string, string>`**:
        *   Test with headers including `Authorization: Bearer ...`. Should return headers with `Authorization` value masked (e.g., `Authorization: "Bearer [MASKED]"`) or the header omitted entirely.
        *   Test with headers *not* including `Authorization`. Should return the same headers.
        *   Test with empty headers object. Should return empty object.
    *   **`formatDataForCsv(record: RawMetricData): CsvRow`**:
        *   Test converting the internal data structure (holding all info from FR3.1.7) into the flat structure required for a CSV row, ensuring correct order and types (especially timestamps). Ensure headers are sanitized via `sanitizeHeaders` during this process.
    *   **`calculateDuration(startTime: number, endTime: number): number`**:
        *   Test with typical timestamps. Should return the correct difference in milliseconds.
