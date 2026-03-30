/**
 * delete command - Delete a conversation
 */

import inquirer from 'inquirer';
import { getDb, findConversationById, deleteConversationById } from '../db.js';

interface DeleteCommandOptions {
  force?: boolean;
}

export async function deleteCommand(conversationId: string, options: DeleteCommandOptions): Promise<void> {
  const db = getDb();
  const conversation = findConversationById(db, conversationId);
  
  if (!conversation) {
    console.error(`Error: Conversation '${conversationId}' not found.`);
    process.exit(1);
  }
  
  if (!options.force) {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Delete conversation "${conversation.title}"?`,
        default: false,
      },
    ]);
    
    if (!answers.confirm) {
      console.log('Cancelled.');
      return;
    }
  }
  
  const deleted = deleteConversationById(db, conversationId);
  
  if (deleted) {
    console.log(`✓ Deleted conversation "${conversation.title}"`);
  } else {
    console.error('Error: Failed to delete conversation.');
    process.exit(1);
  }
}
