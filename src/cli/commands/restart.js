import { Command } from 'commander';
import Orchestrator from '../orchestrator.js';
import { loadConfig } from '../../config/loader.js';

export default new Command('restart')
  .description('Restart a specific AI router instance')
  .argument('<name>', 'Name of the router instance')
  .option('-c, --config <path>', 'Path to router config JSON file', 'config/default.json')
  .action((name, options) => {
    Orchestrator.stopWorker(name);
    
    // Give OS a second to clear process
    setTimeout(() => {
      const startResult = Orchestrator.startWorker(options.config, name);
      if (startResult.success) {
        console.log(`✅ Router '${name}' restarted (PID: ${startResult.pid})`);
      } else {
        console.error(`❌ Failed to restart '${name}':`, startResult.error);
        process.exit(1);
      }
    }, 1000);
  });
