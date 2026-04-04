#!/usr/bin/env node
/**
 * ai-router.js
 * ============
 * CLI entry point for 'ai-router'.
 * Registers start, start-all, stop, stop-all, status, restart, init commands.
 */

import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Import commands
import startCmd from '../src/cli/commands/start.js';
import startAllCmd from '../src/cli/commands/startAll.js';
import stopCmd from '../src/cli/commands/stop.js';
import stopAllCmd from '../src/cli/commands/stopAll.js';
import statusCmd from '../src/cli/commands/status.js';
import restartCmd from '../src/cli/commands/restart.js';
import initCmd from '../src/cli/commands/init.js';
import removeCmd from '../src/cli/commands/remove.js';

// Setup CLI
const pkgPath = resolve(new URL('.', import.meta.url).pathname, '../package.json');
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  program.version(pkg.version);
} catch {
  program.version('1.0.0');
}

program.description('Universal AI Router CLI');

// Register commands
program.addCommand(startCmd);
program.addCommand(startAllCmd);
program.addCommand(stopCmd);
program.addCommand(stopAllCmd);
program.addCommand(statusCmd);
program.addCommand(restartCmd);
program.addCommand(initCmd);
program.addCommand(removeCmd);

// Run
program.parse(process.argv);
