// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"getting-started.mdx": () => import("../content/getting-started.mdx?collection=docs"), "index.mdx": () => import("../content/index.mdx?collection=docs"), "user-guide.mdx": () => import("../content/user-guide.mdx?collection=docs"), }),
};
export default browserCollections;