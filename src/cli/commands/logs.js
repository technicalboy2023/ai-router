import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Tail } from 'tail'; // Missing dependency, but we can do simple read or fall back

export default new Command('logs')
  .description('Tail logs for a specific AI router instance')
  .argument('<name>', 'Name of the router instance')
  .option('-n, --lines <number>', 'Number of lines to show initially', '50')
  .action(async (name, options) => {
    const logPath = resolve(`logs/${name}.log`);
    
    if (!existsSync(logPath)) {
      console.error(`❌ Log file not found: ${logPath}`);
      return;
    }

    try {
      const { spawn } = await import('node:child_process');
      const tail = spawn('tail', ['-n', options.lines, '-f', logPath]);
      
      tail.stdout.on('data', data => process.stdout.write(data));
      tail.stderr.on('data', data => process.stderr.write(data));
      
      process.on('SIGINT', () => {
        tail.kill('SIGINT');
        process.exit(0);
      });
    } catch (err) {
      console.log('Failed to stream logs. Reading file directly instead...');
      const content = readFileSync(logPath, 'utf8');
      const lines = content.split('\n');
      console.log(lines.slice(-Math.min(lines.length, parseInt(options.lines) + 1)).join('\n'));
    }
  });
