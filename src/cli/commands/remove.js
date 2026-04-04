import { Command } from 'commander';
import Orchestrator from '../orchestrator.js';
import { resolve, join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

export default new Command('remove')
  .description('Completely remove an AI router instance (stops process, deletes config and logs)')
  .argument('<name>', 'Name of the router instance to remove')
  .action((name) => {
    console.log(`🗑️ Initiating removal of router '${name}'...`);

    // 1. Stop the running process if it exists
    const stopResult = Orchestrator.stopWorker(name);
    if (!stopResult.success) {
      console.error(`⚠️ Failed to stop router process: ${stopResult.error}. Proceeding with file cleanup anyway...`);
    } else if (stopResult.note) {
      console.log(`ℹ️ Process status: ${stopResult.note}`);
    } else {
      console.log(`⏹️ Successfully stopped running process for '${name}'.`);
    }

    let removedItems = 0;

    // 2. Delete the configuration file
    try {
      const configPath = resolve(join('config', `${name}.json`));
      if (existsSync(configPath)) {
        unlinkSync(configPath);
        console.log(`✅ Deleted configuration file: ${configPath}`);
        removedItems++;
      } else {
        console.log(`ℹ️ Config file not found, skipping: ${configPath}`);
      }
    } catch (err) {
      console.error(`❌ Failed to delete config file: ${err.message}`);
    }

    // 3. Delete the log file (based on standard log naming convention)
    try {
      // Common log names generated or specified in gateway
      const standardLogPath = resolve(join('logs', `${name}.log`));
      const gatewayLogPath = resolve(join('logs', `gateway.log`)); // if it happens to use default
      
      if (existsSync(standardLogPath)) {
        unlinkSync(standardLogPath);
        console.log(`✅ Deleted log file: ${standardLogPath}`);
        removedItems++;
      } else if (name === 'default' && existsSync(gatewayLogPath)) {
         // Default config initially points to gateway.log
         unlinkSync(gatewayLogPath);
         console.log(`✅ Deleted default log file: ${gatewayLogPath}`);
         removedItems++;
      } else {
         console.log(`ℹ️ Log file not found, skipping (${standardLogPath})`);
      }
    } catch (err) {
      console.error(`❌ Failed to delete log file: ${err.message}`);
    }
    
    // Final Summary
    if (removedItems > 0 || stopResult.success) {
      console.log(`\n🎉 Successfully wiped router '${name}' clean.`);
    } else {
      console.log(`\n⚠️ Nothing found to remove for '${name}'.`);
    }
  });
