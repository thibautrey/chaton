// @ts-nocheck
import * as __fd_glob_21 from "../content/extensions/ui-library.mdx?collection=docs"
import * as __fd_glob_20 from "../content/extensions/tutorial.mdx?collection=docs"
import * as __fd_glob_19 from "../content/extensions/requirement-sheets.mdx?collection=docs"
import * as __fd_glob_18 from "../content/extensions/publishing.mdx?collection=docs"
import * as __fd_glob_17 from "../content/extensions/index.mdx?collection=docs"
import * as __fd_glob_16 from "../content/extensions/channels.mdx?collection=docs"
import * as __fd_glob_15 from "../content/extensions/api.mdx?collection=docs"
import * as __fd_glob_14 from "../content/versioning-implementation.mdx?collection=docs"
import * as __fd_glob_13 from "../content/vers.mdx?collection=docs"
import * as __fd_glob_12 from "../content/user-guide.mdx?collection=docs"
import * as __fd_glob_11 from "../content/task-progress-bar.mdx?collection=docs"
import * as __fd_glob_10 from "../content/signing-guide.mdx?collection=docs"
import * as __fd_glob_9 from "../content/semantic-versioning.mdx?collection=docs"
import * as __fd_glob_8 from "../content/pi-integration.mdx?collection=docs"
import * as __fd_glob_7 from "../content/manual-signing-instructions.mdx?collection=docs"
import * as __fd_glob_6 from "../content/index.mdx?collection=docs"
import * as __fd_glob_5 from "../content/implementation-summary.mdx?collection=docs"
import * as __fd_glob_4 from "../content/getting-started.mdx?collection=docs"
import * as __fd_glob_3 from "../content/documentation-audit.mdx?collection=docs"
import * as __fd_glob_2 from "../content/developer-guide.mdx?collection=docs"
import * as __fd_glob_1 from "../content/automation-extension.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content", {"meta.json": __fd_glob_0, }, {"automation-extension.mdx": __fd_glob_1, "developer-guide.mdx": __fd_glob_2, "documentation-audit.mdx": __fd_glob_3, "getting-started.mdx": __fd_glob_4, "implementation-summary.mdx": __fd_glob_5, "index.mdx": __fd_glob_6, "manual-signing-instructions.mdx": __fd_glob_7, "pi-integration.mdx": __fd_glob_8, "semantic-versioning.mdx": __fd_glob_9, "signing-guide.mdx": __fd_glob_10, "task-progress-bar.mdx": __fd_glob_11, "user-guide.mdx": __fd_glob_12, "vers.mdx": __fd_glob_13, "versioning-implementation.mdx": __fd_glob_14, "extensions/api.mdx": __fd_glob_15, "extensions/channels.mdx": __fd_glob_16, "extensions/index.mdx": __fd_glob_17, "extensions/publishing.mdx": __fd_glob_18, "extensions/requirement-sheets.mdx": __fd_glob_19, "extensions/tutorial.mdx": __fd_glob_20, "extensions/ui-library.mdx": __fd_glob_21, });