/**
 * show command - Show conversation details
 */

import { getDb, findConversationById } from '../db.js';

interface ShowCommandOptions {
  json?: boolean;
}

export async function showCommand(conversationId: string, options: ShowCommandOptions): Promise<void> {
  const db = getDb();
  const conversation = findConversationById(db, conversationId);
  
  if (!conversation) {
    console.error(`Error: Conversation '${conversationId}' not found.`);
    process.exit(1);
  }
  
  if (options.json) {
    const output = {
      id: conversation.id,
      title: conversation.title,
      titleSource: conversation.title_source,
      status: conversation.status,
      projectId: conversation.project_id,
      model: conversation.model_id ? `${conversation.model_provider}/${conversation.model_id}` : null,
      thinkingLevel: conversation.thinking_level,
      accessMode: conversation.access_mode,
      runtimeLocation: conversation.runtime_location,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      lastMessageAt: conversation.last_message_at,
      piSessionFile: conversation.pi_session_file,
      worktreePath: conversation.worktree_path,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('');
    console.log(`Conversation Details`);
    console.log('─'.repeat(50));
    console.log(`  ID:           ${conversation.id}`);
    console.log(`  Title:        ${conversation.title}`);
    console.log(`  Status:       ${conversation.status}`);
    console.log(`  Created:      ${new Date(conversation.created_at).toLocaleString('fr-FR')}`);
    console.log(`  Updated:      ${new Date(conversation.updated_at).toLocaleString('fr-FR')}`);
    console.log(`  Last Message: ${new Date(conversation.last_message_at).toLocaleString('fr-FR')}`);
    
    if (conversation.project_id) {
      console.log(`  Project ID:   ${conversation.project_id}`);
    }
    
    if (conversation.model_id) {
      console.log(`  Model:        ${conversation.model_provider}/${conversation.model_id}`);
    }
    
    if (conversation.thinking_level) {
      console.log(`  Thinking:     ${conversation.thinking_level}`);
    }
    
    console.log(`  Access Mode:  ${conversation.access_mode}`);
    console.log(`  Runtime:      ${conversation.runtime_location}`);
    
    if (conversation.pi_session_file) {
      console.log(`  Session:      ${conversation.pi_session_file}`);
    }
    
    if (conversation.worktree_path) {
      console.log(`  Worktree:     ${conversation.worktree_path}`);
    }
    
    if (conversation.last_runtime_error) {
      console.log(`  Last Error:   ${conversation.last_runtime_error}`);
    }
    
    console.log('');
    console.log(`To start chatting, run:`);
    console.log(`  chatons repl ${conversation.id}`);
    console.log('');
  }
}
