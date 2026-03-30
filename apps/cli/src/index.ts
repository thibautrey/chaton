#!/usr/bin/env node

/**
 * Chatons CLI - Headless AI conversation interface
 */

import { Command } from 'commander';
import { listCommand } from './commands/list.js';
import { newCommand } from './commands/new.js';
import { showCommand } from './commands/show.js';
import { deleteCommand } from './commands/delete.js';
import { replCommand } from './commands/repl.js';
import { configCommand } from './commands/config.js';
import { modelsCommand } from './commands/models.js';

const program = new Command();

program
  .name('chatons')
  .description('Chatons CLI - Headless AI conversation interface')
  .version('0.1.0');

program
  .command('list')
  .alias('ls')
  .description('List all conversations')
  .option('-p, --project <id>', 'Filter by project ID')
  .option('--json', 'Output as JSON')
  .action(listCommand);

program
  .command('new')
  .description('Create a new conversation')
  .argument('[title]', 'Conversation title', 'New conversation')
  .option('-p, --project <id>', 'Link to project ID')
  .option('--model <model>', 'Model to use (format: provider/modelId)')
  .action(newCommand);

program
  .command('show')
  .alias('view')
  .description('Show conversation details')
  .argument('<id>', 'Conversation ID')
  .option('--json', 'Output as JSON')
  .action(showCommand);

program
  .command('delete')
  .alias('rm')
  .description('Delete a conversation')
  .argument('<id>', 'Conversation ID')
  .option('-f, --force', 'Skip confirmation')
  .action(deleteCommand);

program
  .command('repl')
  .description('Start interactive conversation mode')
  .argument('[id]', 'Conversation ID (creates new if not provided)')
  .option('-m, --model <model>', 'Model to use (format: provider/modelId)')
  .option('--title <title>', 'Title for new conversation')
  .action(replCommand);

program
  .command('models')
  .description('List available models')
  .option('--json', 'Output as JSON')
  .action(modelsCommand);

program
  .command('config')
  .description('Configure CLI settings')
  .addCommand(
    new Command('init')
      .description('Initialize CLI (copy config from desktop app or create new)')
      .action(configCommand)
  );

// Parse and execute
program.parse();
