/**
 * list command - List all conversations
 */

import { getDb, listConversations, listConversationsByProjectId, type DbConversation } from '../db.js';

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Hier';
  } else if (diffDays < 7) {
    return `Il y a ${diffDays} jours`;
  } else {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
}

function formatConversation(conv: DbConversation, index: number): string {
  const statusIcon = conv.status === 'active' ? '●' : conv.status === 'archived' ? '○' : '·';
  const model = conv.model_id ? `${conv.model_provider}/${conv.model_id}` : '';
  return [
    `${index + 1}. ${statusIcon} ${conv.title}`,
    `   ID: ${conv.id.slice(0, 8)}...  |  Updated: ${formatDate(conv.updated_at)}${model ? `  |  Model: ${model}` : ''}`,
  ].join('\n');
}

export async function listCommand(options: { project?: string; json?: boolean }): Promise<void> {
  const db = getDb();
  
  let conversations: DbConversation[];
  if (options.project) {
    conversations = listConversationsByProjectId(db, options.project);
  } else {
    conversations = listConversations(db);
  }
  
  if (conversations.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log('No conversations found.');
    }
    return;
  }
  
  if (options.json) {
    const output = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      projectId: c.project_id,
      model: c.model_id ? `${c.model_provider}/${c.model_id}` : null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      lastMessageAt: c.last_message_at,
    }));
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nConversations (${conversations.length}):\n`);
    conversations.forEach((conv, i) => {
      console.log(formatConversation(conv, i));
    });
    console.log('');
  }
}
