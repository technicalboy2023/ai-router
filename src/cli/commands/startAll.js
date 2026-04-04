import { Command } from 'commander';
import { loadAllConfigs } from '../../config/loader.js';
import Orchestrator from '../orchestrator.js';
import { resolve } from 'node:path';

export default new Command('start-all')
  .description('Start all AI router instances found in config directory')
  .option('-d, --dir <path>', 'Directory containing config JSON files', 'config')
  .action((options) => {
    const configs = loadAllConfigs(options.dir);
    
    if (configs.length === 0) {
      console.error(`❌ No valid config files found in directory: ${resolve(options.dir)}`);
      process.exit(1);
    }
    
    console.log(`Found ${configs.length} router configuration(s). Starting...`);
    
    for (const result of configs) {
      if (!result.success) {
        console.warn(`⚠️ Skipping config ${result.file}: ${result.error}`);
        continue;
      }
      
      const configPath = resolve(options.dir, result.file);
      const name = result.config.name || result.file.replace('.json', '');
      
      const startResult = Orchestrator.startWorker(configPath, name);
      if (startResult.success) {
        console.log(`✅ Started '${name}' (PID: ${startResult.pid})`);
      } else {
        console.log(`⚠️ Failed to start '${name}': ${startResult.error || startResult.note}`);
      }
    }
    
    console.log('\nUse "ai-router status" to check running instances.');
  });
