#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const program = new Command();

program
  .name('squabble-review')
  .description('View formatted PM reviews')
  .version('1.0.0');

program
  .command('show <taskId>')
  .description('Display formatted review for a task')
  .option('-r, --raw', 'Show raw JSON stream instead of formatted')
  .action(async (taskId: string, options: { raw?: boolean }) => {
    try {
      const workspaceRoot = process.cwd();
      const reviewDir = path.join(workspaceRoot, '.squabble', 'workspace', 'reviews', taskId);
      
      if (!(await fs.pathExists(reviewDir))) {
        console.error(chalk.red(`No review found for task ${taskId}`));
        process.exit(1);
      }
      
      if (options.raw) {
        // Show raw JSON stream
        const rawPath = path.join(reviewDir, 'raw.jsonl');
        if (await fs.pathExists(rawPath)) {
          const content = await fs.readFile(rawPath, 'utf-8');
          console.log(content);
        } else {
          console.error(chalk.red('Raw review data not found'));
          process.exit(1);
        }
      } else {
        // Show formatted markdown
        const mdPath = path.join(reviewDir, 'formatted.md');
        if (await fs.pathExists(mdPath)) {
          const content = await fs.readFile(mdPath, 'utf-8');
          console.log(content);
        } else {
          // Fall back to JSON if markdown not available
          const jsonPath = path.join(reviewDir, 'formatted.json');
          if (await fs.pathExists(jsonPath)) {
            const review = await fs.readJson(jsonPath);
            console.log(chalk.bold(`Review for ${review.metadata.taskId}: ${review.metadata.taskTitle}`));
            console.log(`Status: ${review.approval}`);
            console.log(`\nSummary:\n${review.summary}`);
            
            if (review.actionItems.length > 0) {
              console.log('\nAction Items:');
              review.actionItems.forEach((item: string, i: number) => {
                console.log(`${i + 1}. ${item}`);
              });
            }
          } else {
            console.error(chalk.red('No formatted review data found'));
            process.exit(1);
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error reading review:'), error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all available reviews')
  .action(async () => {
    try {
      const workspaceRoot = process.cwd();
      const reviewsDir = path.join(workspaceRoot, '.squabble', 'workspace', 'reviews');
      
      if (!(await fs.pathExists(reviewsDir))) {
        console.log(chalk.yellow('No reviews found'));
        return;
      }
      
      const taskDirs = await fs.readdir(reviewsDir);
      console.log(chalk.bold('Available reviews:\n'));
      
      for (const taskId of taskDirs) {
        const jsonPath = path.join(reviewsDir, taskId, 'formatted.json');
        if (await fs.pathExists(jsonPath)) {
          try {
            const review = await fs.readJson(jsonPath);
            const statusEmoji = review.approval === 'approved' ? '✅' : 
                               review.approval === 'changes-requested' ? '❌' : '💭';
            console.log(`${statusEmoji} ${chalk.cyan(taskId)}: ${review.metadata.taskTitle}`);
            console.log(`   Reviewed: ${new Date(review.metadata.reviewedAt).toLocaleString()}`);
            console.log(`   Summary: ${review.summary.substring(0, 80)}...\n`);
          } catch (e) {
            // Skip if can't read
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error listing reviews:'), error);
      process.exit(1);
    }
  });

program.parse();