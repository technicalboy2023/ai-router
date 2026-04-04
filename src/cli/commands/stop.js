import { Command } from 'commander';
import Orchestrator from '../orchestrator.js';

export default new Command('stop')
  .description('Stop a specific running AI router instance')
  .argument('<name>', 'Name of the router instance to stop')
  .action((name) => {
    const result = Orchestrator.stopWorker(name);
    if (result.success) {
      if (result.note) {
        console.log(`ℹ️ ${result.note}`);
      } else {
        console.log(`⏹️ Successfully stopped router '${name}'.`);
      }
    } else {
      console.error(`❌ ${result.error}`);
      process.exit(1);
    }
  });
