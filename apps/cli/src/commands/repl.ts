/**
 * repl command - Interactive conversation mode
 * 
 * This is a placeholder - the full implementation will integrate with Pi runtime
 */

import inquirer from 'inquirer';
import { getDb, findConversationById, insertConversation } from '../db.js';
import { ensurePiAgentDir, getAvailableModels, isConfigured } from '../session.js';
import crypto from 'node:crypto';

interface ReplCommandOptions {
  model?: string;
  title?: string;
}

export async function replCommand(id: string | undefined, options: ReplCommandOptions): Promise<void> {
  // Check configuration
  if (!isConfigured()) {
    console.error('Error: CLI is not configured. Run "chatons config init" first.');
    console.error('Or use the Chatons desktop app to configure providers.');
    process.exit(1);
  }
  
  const models = getAvailableModels();
  if (models.length === 0) {
    console.error('Error: No models configured.');
    process.exit(1);
  }
  
  ensurePiAgentDir();
  const db = getDb();
  
  let conversationId = id;
  const conversationTitle = options.title || 'CLI Chat';
  
  // Create conversation if ID not provided
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    insertConversation(db, {
      id: conversationId,
      title: conversationTitle,
      titleSource: 'placeholder',
      runtimeLocation: 'local',
    });
    console.log(`Created new conversation: ${conversationId}\n`);
  }
  
  // Find or verify conversation exists
  const conversation = findConversationById(db, conversationId);
  if (!conversation) {
    console.error(`Error: Conversation '${conversationId}' not found.`);
    process.exit(1);
  }
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              Chatons CLI - Interactive Mode                ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Conversation: ${conversation.title.padEnd(43)}║`);
  console.log(`║  ID: ${conversationId.slice(0, 40).padEnd(46)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Commands:                                                   ║');
  console.log('║    /help     - Show this help                               ║');
  console.log('║    /models   - List available models                        ║');
  console.log('║    /switch   - Switch to a different model                  ║');
  console.log('║    /clear    - Clear screen                                 ║');
  console.log('║    /exit     - Exit REPL                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Start typing your messages. Press Ctrl+C to exit.\n');
  
  // REPL loop
  while (true) {
    try {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: '> ',
        },
      ]);
      
      if (!message.trim()) {
        continue;
      }
      
      // Handle commands
      if (message.startsWith('/')) {
        await handleCommand(message, models);
        continue;
      }
      
      // TODO: Send to Pi runtime and get response
      // For now, just echo back
      console.log('\n[Simulated AI response]');
      console.log('This is where the AI would respond. Full Pi runtime integration coming soon.\n');
      
    } catch (error) {
      if ((error as { name?: string }).name === 'ExitPromptError') {
        console.log('\nGoodbye!');
        break;
      }
      console.error('Error:', error);
    }
  }
}

async function handleCommand(message: string, models: Array<{ provider: string; id: string; name: string }>): Promise<void> {
  const parts = message.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  switch (command) {
    case 'help':
      console.log('');
      console.log('Available commands:');
      console.log('  /help    - Show this help');
      console.log('  /models  - List available models');
      console.log('  /switch  - Switch model (usage: /switch provider/modelId)');
      console.log('  /clear   - Clear screen');
      console.log('  /exit    - Exit REPL');
      console.log('');
      break;
      
    case 'models':
      console.log('\nAvailable models:');
      for (const model of models) {
        console.log(`  ${model.provider}/${model.id} - ${model.name}`);
      }
      console.log('');
      break;
      
    case 'switch':
      if (args.length === 0) {
        console.log('Usage: /switch provider/modelId');
        console.log('Example: /switch anthropic/claude-3-5-sonnet-20241022');
      } else {
        const modelSpec = args[0];
        console.log(`Switching to model: ${modelSpec}`);
        // TODO: Implement model switching
      }
      break;
      
    case 'clear':
      console.clear();
      break;
      
    case 'exit':
    case 'quit':
    case 'q':
      throw new Error('ExitPromptError');
      
    default:
      console.log(`Unknown command: /${command}`);
      console.log('Type /help for available commands.');
  }
}
