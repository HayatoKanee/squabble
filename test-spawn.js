#!/usr/bin/env node

// Test script to debug agent spawning
import { execa } from 'execa';

async function testSpawn() {
  console.log('Testing claude command execution...');
  
  try {
    // First test if claude command exists
    const { stdout: which } = await execa('which', ['claude']);
    console.log('Claude path:', which);
    
    // Try a simple claude command with system prompt and stdin
    console.log('\nTesting simple claude command with system prompt and stdin...');
    const { stdout, stderr } = await execa('claude', [
      '-p',
      '--system-prompt',
      'You are a test agent specialized in greeting people enthusiastically.'
    ], {
      input: 'Say hello',
      timeout: 60000, // 60 second timeout
      env: {
        ...process.env
      }
    });
    
    console.log('STDOUT:', stdout);
    console.log('STDERR:', stderr);
    
  } catch (error) {
    console.error('Error executing claude:', error);
    console.error('Error code:', error.exitCode);
    console.error('Error signal:', error.signal);
    console.error('Error stderr:', error.stderr);
    console.error('Error stdout:', error.stdout);
  }
}

testSpawn();