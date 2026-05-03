/**
 * loader.js
 * =========
 * Config file loader with hybrid key resolution (env + config).
 *
 * Loads router config from JSON files, merges with environment variables,
 * and validates with Zod schemas.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { validateConfig } from './schema.js';

// Load .env file
loadDotenv();

/**
 * Load keys from environment variables for a provider.
 * Supports both numbered keys (PREFIX_KEY_1..20) and comma-separated (PREFIX_KEYS).
 * @param {string} prefix - Environment variable prefix (e.g. 'OPENROUTER', 'GEMINI')
 * @returns {string[]}
 */
export function loadKeysFromEnv(prefix) {
  const keys = [];

  // Numbered keys: PREFIX_KEY_1 through PREFIX_KEY_20
  for (let i = 1; i <= 20; i++) {
    const val = process.env[`${prefix}_KEY_${i}`];
    if (val && val.trim() && !val.includes('...')) {
      keys.push(val.trim());
    }
  }

  // Comma-separated: PREFIX_KEYS
  const bulk = process.env[`${prefix}_KEYS`];
  if (bulk) {
    for (const k of bulk.split(',')) {
      if (k.trim() && !k.includes('...')) {
        keys.push(k.trim());
      }
    }
  }

  // Deduplicate preserving order
  return [...new Set(keys)];
}

/**
 * Resolve keys for a provider config — hybrid env + config support.
 * Environment variables take priority and are merged with config keys.
 * @param {object} providerConfig - Provider config section
 * @param {string} envPrefix - Environment variable prefix
 * @returns {string[]}
 */
function resolveKeys(providerConfig, envPrefix) {
  const configKeys = providerConfig.keys || [];
  const envKeys = loadKeysFromEnv(envPrefix);

  // Merge: env keys first, then config keys, deduplicated
  const merged = [...envKeys];
  for (const k of configKeys) {
    // Resolve env var references (e.g. "$OPENROUTER_KEY_1")
    if (k.startsWith('$')) {
      const envVal = process.env[k.slice(1)];
      if (envVal && envVal.trim()) {
        merged.push(envVal.trim());
      }
    } else if (k.trim() && !k.includes('...')) {
      merged.push(k.trim());
    }
  }

  return [...new Set(merged)];
}

/**
 * Load and validate a single router config file.
 * @param {string} configPath - Path to JSON config file
 * @returns {{ success: boolean, config?: object, error?: string, name?: string }}
 */
export function loadConfig(configPath) {
  const fullPath = resolve(configPath);

  if (!existsSync(fullPath)) {
    return { success: false, error: `Config file not found: ${fullPath}` };
  }

  let rawConfig;
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    rawConfig = JSON.parse(raw);
  } catch (err) {
    return { success: false, error: `Failed to parse ${fullPath}: ${err.message}` };
  }

  // Validate and apply defaults
  const result = validateConfig(rawConfig);
  if (!result.success) {
    return { success: false, error: `Validation error in ${fullPath}: ${result.error}` };
  }

  const config = result.data;

  // Resolve keys from env + config (hybrid)
  if (config.providers.openrouter) {
    config.providers.openrouter.keys = resolveKeys(
      config.providers.openrouter,
      config.providers.openrouter.envPrefix || 'OPENROUTER'
    );
  }
  if (config.providers.gemini) {
    config.providers.gemini.keys = resolveKeys(
      config.providers.gemini,
      config.providers.gemini.envPrefix || 'GEMINI'
    );
  }
  if (config.providers.groq) {
    config.providers.groq.keys = resolveKeys(
      config.providers.groq,
      config.providers.groq.envPrefix || 'GROQ'
    );
  }
  if (config.providers.ollama) {
    config.providers.ollama.keys = resolveKeys(
      config.providers.ollama,
      config.providers.ollama.envPrefix || 'OLLAMA'
    );
  }

  // Resolve Auth tokens
  if (config.auth) {
    const envAuthKeys = loadKeysFromEnv('AUTH');
    const directAuthToken = process.env.AUTH_TOKEN;
    const directAuthTokens = process.env.AUTH_TOKENS;

    const mergedAuthTokens = [...(config.auth.tokens || []), ...envAuthKeys];
    if (directAuthToken && directAuthToken.trim()) mergedAuthTokens.push(directAuthToken.trim());
    if (directAuthTokens) {
      for (const k of directAuthTokens.split(',')) {
        if (k.trim()) mergedAuthTokens.push(k.trim());
      }
    }

    const finalAuthTokens = [];
    for (const k of mergedAuthTokens) {
      if (typeof k === 'string' && k.startsWith('$')) {
        const envVal = process.env[k.slice(1)];
        if (envVal && envVal.trim()) finalAuthTokens.push(envVal.trim());
      } else if (k && typeof k === 'string' && k.trim()) {
        finalAuthTokens.push(k.trim());
      }
    }

    config.auth.tokens = [...new Set(finalAuthTokens)];
  }

  return { success: true, config, name: config.name };
}

/**
 * Discover and load all router configs from a directory.
 * @param {string} [configDir='config'] - Directory containing router JSON files
 * @returns {Array<{ success: boolean, config?: object, error?: string, file: string }>}
 */
export function loadAllConfigs(configDir = 'config') {
  const dir = resolve(configDir);

  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir)
    .filter(f => extname(f) === '.json' && !f.startsWith('.'))
    .sort();

  return files.map(file => {
    const result = loadConfig(join(dir, file));
    return { ...result, file };
  });
}

/**
 * Create a default config object (useful when no config file exists).
 * Loads keys from environment variables.
 * @param {object} [overrides={}]
 * @returns {object}
 */
export function createDefaultConfig(overrides = {}) {
  const result = validateConfig(overrides);
  if (!result.success) {
    throw new Error(`Invalid config overrides: ${result.error}`);
  }

  const config = result.data;

  // Auto-load keys from env
  config.providers.openrouter.keys = resolveKeys(
    config.providers.openrouter,
    'OPENROUTER'
  );
  config.providers.gemini.keys = resolveKeys(
    config.providers.gemini,
    'GEMINI'
  );
  config.providers.groq.keys = resolveKeys(
    config.providers.groq,
    'GROQ'
  );
  config.providers.ollama.keys = resolveKeys(
    config.providers.ollama,
    'OLLAMA'
  );

  // Resolve Auth tokens
  if (config.auth) {
    const envAuthKeys = loadKeysFromEnv('AUTH');
    const directAuthToken = process.env.AUTH_TOKEN;
    const directAuthTokens = process.env.AUTH_TOKENS;

    const mergedAuthTokens = [...(config.auth.tokens || []), ...envAuthKeys];
    if (directAuthToken && directAuthToken.trim()) mergedAuthTokens.push(directAuthToken.trim());
    if (directAuthTokens) {
      for (const k of directAuthTokens.split(',')) {
        if (k.trim()) mergedAuthTokens.push(k.trim());
      }
    }

    const finalAuthTokens = [];
    for (const k of mergedAuthTokens) {
      if (typeof k === 'string' && k.startsWith('$')) {
        const envVal = process.env[k.slice(1)];
        if (envVal && envVal.trim()) finalAuthTokens.push(envVal.trim());
      } else if (k && typeof k === 'string' && k.trim()) {
        finalAuthTokens.push(k.trim());
      }
    }

    config.auth.tokens = [...new Set(finalAuthTokens)];
  }

  return config;
}

export default { loadConfig, loadAllConfigs, loadKeysFromEnv, createDefaultConfig };
