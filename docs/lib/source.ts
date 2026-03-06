import { loader } from 'fumadocs-core/source';
import { docs } from '../fumadocs.config';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
