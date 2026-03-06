// source.config.ts
import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";
var docs = defineDocs({
  dir: "content",
  docs: {
    schema: frontmatterSchema.extend({
      description: z.string().optional()
    })
  }
});
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [],
    rehypePlugins: []
  }
});
export {
  source_config_default as default,
  docs
};
