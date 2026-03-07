import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '../../../lib/source';

const api = createFromSource(source);

export const GET = api.GET;
