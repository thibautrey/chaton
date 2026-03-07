// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"automation-extension.mdx": () => import("../content/automation-extension.mdx?collection=docs"), "developer-guide.mdx": () => import("../content/developer-guide.mdx?collection=docs"), "documentation-audit.mdx": () => import("../content/documentation-audit.mdx?collection=docs"), "getting-started.mdx": () => import("../content/getting-started.mdx?collection=docs"), "implementation-summary.mdx": () => import("../content/implementation-summary.mdx?collection=docs"), "index.mdx": () => import("../content/index.mdx?collection=docs"), "manual-signing-instructions.mdx": () => import("../content/manual-signing-instructions.mdx?collection=docs"), "pi-integration.mdx": () => import("../content/pi-integration.mdx?collection=docs"), "semantic-versioning.mdx": () => import("../content/semantic-versioning.mdx?collection=docs"), "signing-guide.mdx": () => import("../content/signing-guide.mdx?collection=docs"), "user-guide.mdx": () => import("../content/user-guide.mdx?collection=docs"), "vers.mdx": () => import("../content/vers.mdx?collection=docs"), "versioning-implementation.mdx": () => import("../content/versioning-implementation.mdx?collection=docs"), "extensions/api.mdx": () => import("../content/extensions/api.mdx?collection=docs"), "extensions/channels.mdx": () => import("../content/extensions/channels.mdx?collection=docs"), "extensions/index.mdx": () => import("../content/extensions/index.mdx?collection=docs"), "extensions/ui-library.mdx": () => import("../content/extensions/ui-library.mdx?collection=docs"), }),
};
export default browserCollections;