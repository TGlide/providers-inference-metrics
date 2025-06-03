
// --- API Response Structures ---


export interface ModelApiResponse {
	author: string;
	authorData: AuthorData;
	downloads: number;
	gated: boolean;
	id: string;
	availableInferenceProviders: ProviderApiResponse[];
	lastModified: string;
	likes: number;
	pipeline_tag: string;
	private: boolean;
	repoType: string;
	isLikedByUser: boolean;
	widgetOutputUrls: any[]; // You might want to define a more specific type if you know the structure of these URLs
}

export interface AuthorData {
	_id: string;
	avatarUrl: string;
	fullname: string;
	name: string;
	type: string;
	isPro: boolean;
	isHf: boolean;
	isHfAdmin: boolean;
	isMod: boolean;
	followerCount: number;
}

export interface ProviderApiResponse {
	provider: string;
	modelStatus: string;
	providerStatus: string;
	providerId: string;
	task: string;
}


export interface ModelsJsonApiResponse {
	models: ModelApiResponse[];
	// Add other potential fields like 'count' if needed
}

// --- Internal Data Structures ---

export interface LiveProviderInfo {
	name: string;
	providerId: string;
}

export interface ModelInfo {
	id: string;
	liveProviders: LiveProviderInfo[];
}

export interface InferenceRequestParams {
	modelId: string;
	provider: LiveProviderInfo;
	apiUrl: string;
	requestBody: Record<string, any>; // Or a more specific type
	hfToken: string;
}

export interface InferenceResult {
	cycleTimestampISO: string;
	modelId: string;
	providerName: string;
	providerModelId: string;
	requestUrl: string;
	requestBody: string; // Raw JSON
	requestHeadersSanitized: string; // JSON string
	requestStartISO: string;
	responseEndISO: string;
	durationMs: number;
	responseStatusCode: number;
	responseBodyRaw: string;
	responseHeadersSanitized: string; // JSON string
	errorMessage: string; // Empty if successful
}

// --- Configuration ---

export interface AppConfig {
	hfToken: string;
	hfHubToken: string;
	hfDatasetRepoId: string;
	hfDatasetTargetFilename: string;
	scheduleIntervalSeconds: number;
	modelsToFetch: number;
	maxTokensDefault: number;
	providerEndpointMappingPath: string;
	localCsvPath: string;
	pushIntervalCycles: number;
	logLevel: string; // Consider using specific levels like 'info' | 'debug' etc.
	providerEndpointMapping: Record<string, string>; // Loaded mapping
}

// --- CSV ---
// Matches the order in spec.md Section 5
export type CsvRow = [
	string, // cycle_timestamp_iso
	string, // model_id
	string, // provider_name
	string, // provider_model_id
	string, // request_url
	string, // request_body
	string, // request_headers_sanitized
	string, // request_start_iso
	string, // response_end_iso
	number, // duration_ms
	number, // response_status_code
	string, // response_body_raw
	string, // response_headers_sanitized
	string  // error_message
];
