import { Command } from 'commander';
import Orchestrator from '../orchestrator.js';

export default new Command('status')
  .description('Show status of all tracked AI router instances')
  .action(() => {
    const statuses = Orchestrator.statusAll();
    
    if (statuses.length === 0) {
      console.log('ℹ️ No tracked router instances found.');
      return;
    }

    console.log('--- AI Router Instances ---');
    console.log('NAME                PID      STATUS');
    console.log('-----------------------------------');
    
    for (const stat of statuses) {
      const namePad = stat.name.padEnd(20, ' ');
      const pidPad = stat.pid.toString().padEnd(8, ' ');
      const statusText = stat.isRunning ? '✅ RUNNING' : '❌ STOPPED / DEAD';
      
      console.log(`${namePad}${pidPad}${statusText}`);
    }
    console.log('-----------------------------------');
  });
