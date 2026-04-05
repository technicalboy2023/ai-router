/**
 * schema.js
 * =========
 * Zod validation schemas for router configuration files.
 * Validates config/router*.json files with sensible defaults.
 */

import { z } from 'zod';

// ── Provider Config Schemas ───────────────────────────────────────────────────

const OpenRouterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().default('https://openrouter.ai/api/v1'),
  keys: z.array(z.string()).default([]),
  envPrefix: z.string().default('OPENROUTER'),
  defaultModel: z.string().default('openrouter/auto'),
  models: z.record(z.string(), z.string()).optional(),
}).default({});

const OllamaConfigSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().default('https://ollama.com/v1'),
  keys: z.array(z.string()).default([]),
  envPrefix: z.string().default('OLLAMA'),
  defaultModel: z.string().default('llama3'),
  models: z.record(z.string(), z.string()).optional(),
}).default({});

const GeminiConfigSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().default('https://generativelanguage.googleapis.com/v1beta'),
  keys: z.array(z.string()).default([]),
  envPrefix: z.string().default('GEMINI'),
  defaultModel: z.string().default('gemini-1.5-flash'),
  models: z.record(z.string(), z.string()).optional(),
}).default({});

const GroqConfigSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().default('https://api.groq.com/openai/v1'),
  keys: z.array(z.string()).default([]),
  envPrefix: z.string().default('GROQ'),
  defaultModel: z.string().default('llama3-8b-8192'),
  models: z.record(z.string(), z.string()).optional(),
}).default({});

// ── Routing Config ────────────────────────────────────────────────────────────

const RoutingConfigSchema = z.object({
  strategy: z.enum(['priority', 'model-based', 'latency-aware', 'round-robin']).default('model-based'),
  providerOrder: z.array(z.string()).default(['groq', 'openrouter', 'gemini', 'ollama']),
  modelMapping: z.record(z.string(), z.string()).default({
    'llama*': 'groq',
    'mixtral*': 'groq',
    'gemma*': 'groq'
  }),
  categoryMapping: z.record(z.string(), z.string()).optional(),
}).default({});

// ── Fallback Config ───────────────────────────────────────────────────────────

const FallbackConfigSchema = z.object({
  models: z.array(z.string()).default([]),
  providers: z.array(z.string()).default(['groq', 'openrouter', 'gemini', 'ollama']),
  maxRetries: z.number().int().min(1).max(10).default(4),
  backoff: z.object({
    initial: z.number().default(500),
    factor: z.number().default(2),
    max: z.number().default(16000),
  }).default({}),
}).default({});

// ── Cache Config ──────────────────────────────────────────────────────────────

const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ttl: z.number().int().min(1).default(30),
  maxSize: z.number().int().min(1).default(512),
}).default({});

// ── Performance Config ────────────────────────────────────────────────────────

const PerformanceConfigSchema = z.object({
  maxConnections: z.number().int().default(300),
  maxKeepAlive: z.number().int().default(80),
  keepAliveTimeout: z.number().default(30000),
  timeoutConnect: z.number().default(10000),
  timeoutRead: z.number().default(120000),
}).default({});

// ── Logging Config ────────────────────────────────────────────────────────────

const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  file: z.string().default('logs/gateway.log'),
  console: z.boolean().default(true),
}).default({});

// ── Auth Config ───────────────────────────────────────────────────────────────

const AuthConfigSchema = z.object({
  enabled: z.boolean().default(false),
  tokens: z.array(z.string()).default([]),
  adminTokens: z.array(z.string()).default([]),
}).default({});

// ── Rate Limit Config ─────────────────────────────────────────────────────────

const RateLimitConfigSchema = z.object({
  enabled: z.boolean().default(false),
  windowMs: z.number().default(60000),
  maxRequests: z.number().default(100),
}).default({});

// ── Top-Level Router Config ───────────────────────────────────────────────────

export const RouterConfigSchema = z.object({
  name: z.string().default('default'),
  port: z.number().int().min(1).max(65535).default(8000),
  host: z.string().default('0.0.0.0'),

  providers: z.object({
    openrouter: OpenRouterConfigSchema,
    ollama: OllamaConfigSchema,
    gemini: GeminiConfigSchema,
    groq: GroqConfigSchema,
  }).default({}),

  routing: RoutingConfigSchema,
  fallback: FallbackConfigSchema,
  cache: CacheConfigSchema,
  performance: PerformanceConfigSchema,
  logging: LoggingConfigSchema,
  auth: AuthConfigSchema,
  rateLimit: RateLimitConfigSchema,
});

/**
 * Validate and apply defaults to a raw config object.
 * @param {object} rawConfig
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export function validateConfig(rawConfig) {
  try {
    const data = RouterConfigSchema.parse(rawConfig);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err.errors?.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') || err.message,
    };
  }
}

export default { RouterConfigSchema, validateConfig };
