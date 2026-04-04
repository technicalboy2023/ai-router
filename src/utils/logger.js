/**
 * logger.js
 * =========
 * Structured JSON logging (dual output: file + console).
 * Port of router_core.py structured logger.
 *
 * - File handler: JSON lines → gateway.log (debug level)
 * - Console handler: human-readable (info level)
 * - Pino-based for high performance
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Create a logger instance for a router.
 * @param {object} opts
 * @param {string} [opts.name='ai-router']
 * @param {string} [opts.level='debug']
 * @param {string} [opts.logFile='logs/gateway.log']
 * @param {boolean} [opts.console=true]
 * @returns {pino.Logger}
 */
export function createLogger(opts = {}) {
  const {
    name = 'ai-router',
    level = 'debug',
    logFile = 'logs/gateway.log',
    console: useConsole = true,
  } = opts;

  // Ensure log directory exists
  const logDir = dirname(resolve(logFile));
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const targets = [];

  // File transport — structured JSON lines
  targets.push({
    target: 'pino/file',
    options: { destination: resolve(logFile), mkdir: true },
    level: 'debug',
  });

  // Console transport — human-readable
  if (useConsole) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
      level: 'info',
    });
  }

  const transport = pino.transport({ targets });

  return pino({ name, level }, transport);
}

// Default singleton logger
let _defaultLogger = null;

export function getLogger(opts) {
  if (!_defaultLogger) {
    _defaultLogger = createLogger(opts);
  }
  return _defaultLogger;
}

export function setLogger(logger) {
  _defaultLogger = logger;
}

export default { createLogger, getLogger, setLogger };
