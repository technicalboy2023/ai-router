import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDefaultConfig } from '../../config/loader.js';

export default new Command('init')
  .description('Initialize a new AI router configuration')
  .argument('<name>', 'Name of the router')
  .option('-p, --port <number>', 'Port to listen on', '8000')
  .action((name, options) => {
    const dir = resolve('config');
    const path = resolve(dir, `${name}.json`);

    if (existsSync(path)) {
      console.error(`❌ Configuration file already exists at ${path}`);
      return;
    }

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Try to use default.json as template
    let config;
    try {
      const templatePath = resolve(dir, 'default.json');
      if (existsSync(templatePath)) {
        config = JSON.parse(readFileSync(templatePath, 'utf-8'));
        config.name = name;
        config.port = parseInt(options.port, 10);
      } else {
        throw new Error('No template');
      }
    } catch {
      config = createDefaultConfig({
        name,
        port: parseInt(options.port, 10),
      });
      // Ensure it acts as a hybrid baseline if no template provided
      if (config.providers) {
        for (const prov in config.providers) {
          config.providers[prov].enabled = true;
        }
      }
    }

    writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ Initialized new router configuration at ${path}`);
    console.log(`To start it, run: ai-router start -c config/${name}.json`);
  });
