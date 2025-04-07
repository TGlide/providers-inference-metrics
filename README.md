---
title: Inference Providers Metrics Tracker
emoji: 👁️‍🗨️ # Changed emoji slightly
colorFrom: indigo
colorTo: blue # Changed color slightly
# sdk: docker # Removed Docker SDK reference
pinned: false
---

# Inference Providers Metrics Tracker

This application continuously monitors the availability, performance (latency), and response details of various Hugging Face Inference API providers for popular text-generation models. It runs scheduled checks, performs inference calls, and uploads the collected metrics to a designated Hugging Face Dataset repository.

## Features

*   **Scheduled Execution:** Runs monitoring cycles automatically at a configurable interval (default: 30 minutes).
*   **Top Model Fetching:** Identifies the top trending text-generation models with available inference providers from the Hugging Face Models API.
*   **Provider Inference Testing:** Sends a standardized inference request to each live provider for the selected models.
*   **Detailed Metrics Collection:** Records request/response timings, status codes, headers (sanitized), bodies, and errors for each call.
*   **Local Data Buffering:** Appends collected metrics to a local CSV file (`metrics_buffer.csv` by default).
*   **Hugging Face Hub Integration:** Periodically uploads the buffered CSV data to a specified Hugging Face Dataset repository using `@huggingface/hub`.
*   **Configurable:** Most parameters (schedule, models to test, tokens, HF repo details, etc.) can be configured via environment variables.
*   **Structured Logging:** Uses Pino for structured JSON logging with configurable levels.

## Prerequisites

*   **Bun:** This project uses the Bun runtime. Installation instructions: [https://bun.sh/docs/installation](https://bun.sh/docs/installation)
*   **Hugging Face Tokens:**
    *   An **Inference API Token** (`HF_TOKEN`) for making calls to the inference providers. Read permissions are usually sufficient. Get one from [HF Settings > Access Tokens](https://huggingface.co/settings/tokens).
    *   A **Hub Token** (`HF_HUB_TOKEN`) with `write` permissions for the target dataset repository. Get one from [HF Settings > Access Tokens](https://huggingface.co/settings/tokens).
*   **Git:** For cloning the repository.

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```
2.  **Install dependencies:**
    ```bash
    bun install
    ```
3.  **Configure Environment Variables:**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   **Edit the `.env` file** and fill in your actual Hugging Face tokens (`HF_TOKEN`, `HF_HUB_TOKEN`) and the target dataset repository ID (`HF_DATASET_REPO_ID`). Review other configuration options (see Configuration section below).
    *   **Important:** Ensure the `.env` file is *not* committed to Git (it's included in `.gitignore`).

## Configuration

Configuration is managed via environment variables loaded from the `.env` file. See `.env.example` for all available options:

*   **Secrets:**
    *   `HF_TOKEN`: Your Inference API token. **(Required)**
    *   `HF_HUB_TOKEN`: Your Hub token with write access to the dataset repo. **(Required)**
*   **Hugging Face Dataset:**
    *   `HF_DATASET_REPO_ID`: The ID of the target dataset (e.g., "YourUsername/inference-metrics"). **(Required)**
    *   `HF_DATASET_TARGET_FILENAME`: The name of the CSV file within the dataset (default: `metrics.csv`).
*   **Scheduler:**
    *   `SCHEDULE_INTERVAL_SECONDS`: How often to run a monitoring cycle (default: `1800` / 30 minutes).
    *   `PUSH_INTERVAL_CYCLES`: How many cycles to wait before pushing the local buffer to the Hub (default: `6`).
*   **Model & Inference:**
    *   `MODELS_TO_FETCH`: Number of top models to test per cycle (default: `5`).
    *   `MAX_TOKENS_DEFAULT`: Default `max_tokens` for inference requests (default: `4096`).
    *   `PROVIDER_ENDPOINT_MAPPING_PATH`: Path to the JSON file mapping provider names to API URLs (default: `./provider_mapping.json`). You may need to update this file if new providers are added or URLs change.
*   **Local Storage:**
    *   `LOCAL_CSV_PATH`: Path for the temporary CSV buffer file (default: `./metrics_buffer.csv`).
*   **Logging:**
    *   `LOG_LEVEL`: Logging verbosity ('info', 'debug', 'warn', 'error', etc.) (default: `info`).

## Running the Application

Start the monitoring process using:

```bash
bun run index.ts
```

The application will run continuously in the foreground, logging output to the console. Press `Ctrl+C` to stop it gracefully (it will attempt a final data upload if configured and not currently in a cycle).

For long-term running, consider using a process manager like `pm2` or running it within a `screen` or `tmux` session.

## Data Output

*   **Local Buffer:** Metrics are temporarily stored in the CSV file specified by `LOCAL_CSV_PATH`. This file is cleared after each successful upload to the Hub.
*   **Hugging Face Dataset:** The primary output is the CSV file uploaded to the specified `HF_DATASET_REPO_ID`.
*   **CSV Schema:** The columns follow the structure defined in `spec.md` (Section 5):
    ```
    cycle_timestamp_iso, model_id, provider_name, provider_model_id, request_url, request_body, request_headers_sanitized, request_start_iso, response_end_iso, duration_ms, response_status_code, response_body_raw, response_headers_sanitized, error_message
    ```
    *Note: Sensitive headers like `Authorization` are masked in the `*_headers_sanitized` columns.*

## Technical Stack

*   **Runtime:** Bun
*   **Language:** TypeScript
*   **Key Libraries:**
    *   `@huggingface/hub`: For uploading data to Hugging Face Hub.
    *   `pino` / `pino-pretty`: For structured and human-readable logging.
    *   `dotenv`: For loading environment variables.
    *   `csv-stringify`: For robust CSV generation.

## Project Structure (Simplified)

```
.
├── .env.example        # Example environment variables
├── .gitignore          # Files ignored by Git
├── bun.lockb           # Bun lockfile
├── index.ts            # Main application entry point and scheduler
├── package.json        # Project metadata and dependencies
├── provider_mapping.json # Maps provider names to API URLs
├── README.md           # This file
├── spec.md             # Detailed functional/non-functional specifications
├── src/                # Source code directory
│   ├── config.ts       # Loads and validates configuration
│   ├── csvHandler.ts   # Handles CSV reading, writing, formatting
│   ├── hfClient.ts     # Fetches models, performs inference calls
│   ├── hubUploader.ts  # Handles uploading CSV to HF Hub
│   ├── logger.ts       # Configures the Pino logger
│   ├── types.ts        # TypeScript type definitions
│   └── utils.ts        # Utility functions (retry, sanitize, etc.)
└── tsconfig.json       # TypeScript compiler options
```
