/**
 * index.js
 * ========
 * Library entry point — exports all core modules.
 * Used by worker.js and can be imported as a library.
 */

// Router Core
export { KeyHealth, LATENCY_WINDOW, COOLDOWN_WINDOW, ERROR_THRESHOLD } from './router_core/KeyHealth.js';
export { KeyRegistry } from './router_core/KeyRegistry.js';
export { ResponseCache } from './router_core/ResponseCache.js';
export { UsageStore } from './router_core/UsageStore.js';

// Utils
export { createLogger, getLogger, setLogger } from './utils/logger.js';
export { initHttpClient, getHttpAgent, closeHttpClient, httpFetch, httpStream } from './utils/httpClient.js';
export { backoffSleep, getBackoffDelay, sleep } from './utils/backoff.js';
export { newRequestId, newCompletionId, newResponseId } from './utils/idGenerator.js';
export { estimateTokens, estimateMessagesTokens } from './utils/tokenEstimator.js';

// Config
export { validateConfig, RouterConfigSchema } from './config/schema.js';
export { loadConfig, loadAllConfigs, loadKeysFromEnv, createDefaultConfig } from './config/loader.js';

// Providers
export { ProviderRegistry } from './providers/ProviderRegistry.js';
export { BaseProvider } from './providers/BaseProvider.js';
export { OpenRouterProvider } from './providers/OpenRouterProvider.js';
export { GeminiProvider } from './providers/GeminiProvider.js';
export { GroqProvider } from './providers/GroqProvider.js';
export { OllamaProvider } from './providers/OllamaProvider.js';
