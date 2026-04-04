/**
 * orchestrator.js
 * ===============
 * Process manager for multi-router deployment.
 * Spawns and tracks node worker processes using child_process.
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const PID_FILE = '.ai-router-pids.json';

export class Orchestrator {
  static _getPids() {
    try {
      if (existsSync(PID_FILE)) {
        return JSON.parse(readFileSync(PID_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  static _savePids(pids) {
    writeFileSync(PID_FILE, JSON.stringify(pids, null, 2), 'utf-8');
  }

  /**
   * Start a router worker process.
   * @param {string} configPath
   * @param {string} name
   */
  static startWorker(configPath, name) {
    const pids = this._getPids();
    
    if (pids[name]) {
      try {
        process.kill(pids[name], 0); // Check if running
        return { success: false, error: `Router '${name}' is already running with PID ${pids[name]}` };
      } catch {
        // Stale PID, proceed
      }
    }

    const workerPath = resolve('src/worker.js');
    const outLog = resolve(`logs/${name}-out.log`);
    const errLog = resolve(`logs/${name}-err.log`);

    if (!existsSync(dirname(outLog))) mkdirSync(dirname(outLog), { recursive: true });

    // Spawn detached process
    const child = spawn(process.execPath, [workerPath, '-c', configPath], {
      detached: true,
      stdio: 'ignore' 
    });

    child.unref();

    pids[name] = child.pid;
    this._savePids(pids);

    return { success: true, pid: child.pid, name };
  }

  /**
   * Stop a running router worker.
   * @param {string} name
   */
  static stopWorker(name) {
    const pids = this._getPids();
    const pid = pids[name];

    if (!pid) return { success: false, error: `No running router found with name '${name}'` };

    try {
      process.kill(pid, 'SIGTERM');
      delete pids[name];
      this._savePids(pids);
      return { success: true, name };
    } catch (err) {
      if (err.code === 'ESRCH') {
        delete pids[name];
        this._savePids(pids);
        return { success: true, note: 'Process was already stopped (stale PID removed)' };
      }
      return { success: false, error: `Failed to kill process ${pid}: ${err.message}` };
    }
  }

  /**
   * Stop all workers.
   */
  static stopAll() {
    const pids = this._getPids();
    const results = [];
    for (const name of Object.keys(pids)) {
      results.push(this.stopWorker(name));
    }
    return results;
  }

  /**
   * Get status of all tracked workers.
   */
  static statusAll() {
    const pids = this._getPids();
    const status = [];

    for (const [name, pid] of Object.entries(pids)) {
      let isRunning = false;
      try {
        process.kill(pid, 0);
        isRunning = true;
      } catch { /* not running */ }

      status.push({ name, pid, isRunning });
    }

    return status;
  }
}

export default Orchestrator;
