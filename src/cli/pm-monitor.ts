#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Simple CLI tool to monitor PM activity in real-time
 * Usage: npm run pm-monitor
 */

const workspaceRoot = path.join(process.cwd(), '.squabble');
const activityLogPath = path.join(workspaceRoot, 'pm-activity.log');

// Check if workspace exists
if (!fs.existsSync(workspaceRoot)) {
  console.error('❌ Squabble workspace not found. Run init_workspace first.');
  process.exit(1);
}

console.log('🔍 Monitoring PM Activity...');
console.log(`📁 Log file: ${activityLogPath}`);
console.log('Press Ctrl+C to stop\n');
console.log('─'.repeat(80));

// Create log file if it doesn't exist
fs.ensureFileSync(activityLogPath);

// Use tail -f to follow the log file
const tail = spawn('tail', ['-f', activityLogPath], {
  stdio: 'inherit'
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopped monitoring PM activity');
  tail.kill();
  process.exit(0);
});

// Handle tail process errors
tail.on('error', (err) => {
  console.error('❌ Error running tail:', err.message);
  console.error('💡 Try running: cat', activityLogPath);
  process.exit(1);
});