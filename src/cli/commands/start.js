import { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import Orchestrator from '../orchestrator.js';

export default new Command('start')
  .description('Start a single AI router instance')
  .option('-c, --config <path>', 'Path to router config JSON file', 'config/default.json')
  .action((options) => {
    const configResult = loadConfig(options.config);
    if (!configResult.success) {
      console.error(`Error loading config: ${configResult.error}`);
      process.exit(1);
    }
    
    const name = configResult.config.name || 'default';
    const result = Orchestrator.startWorker(options.config, name);
    
    if (result.success) {
      console.log(`🚀 AI Router '${name}' started as background process (PID: ${result.pid})`);
    } else {
      console.error(`❌ Failed to start '${name}':`, result.error || result.note);
      process.exit(1);
    }
  });
