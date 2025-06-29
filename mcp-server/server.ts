#!/usr/bin/env node

import { SquabbleMCPServer } from '../src/index.js';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let role: 'engineer' | 'pm' = 'engineer';
  
  // Check for --role argument
  const roleIndex = args.findIndex(arg => arg === '--role');
  if (roleIndex !== -1 && args[roleIndex + 1]) {
    const requestedRole = args[roleIndex + 1];
    if (requestedRole === 'pm' || requestedRole === 'engineer') {
      role = requestedRole;
    } else {
      console.error(`Invalid role: ${requestedRole}. Must be 'engineer' or 'pm'`);
      process.exit(1);
    }
  }
  
  const server = new SquabbleMCPServer(role);
  
  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start Squabble MCP server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});