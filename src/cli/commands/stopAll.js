import { Command } from 'commander';
import Orchestrator from '../orchestrator.js';

export default new Command('stop-all')
  .description('Stop all running AI router instances')
  .action(() => {
    const results = Orchestrator.stopAll();
    
    if (results.length === 0) {
      console.log('ℹ️ No routers are currently running.');
      return;
    }

    let stoppedCount = 0;
    for (const result of results) {
       if (result.success) {
         stoppedCount++;
       } else {
         console.error(`❌ Failed to stop router: ${result.error}`);
       }
    }

    console.log(`⏹️ Stopped ${stoppedCount} router instance(s).`);
  });
