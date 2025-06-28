#!/usr/bin/env node

import { SquabbleMCPServer } from '../src/index.js';

async function main() {
  const server = new SquabbleMCPServer();
  
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