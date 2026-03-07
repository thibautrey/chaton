import { DocsBody, DocsPage } from 'fumadocs-ui/page';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { notFound } from 'next/navigation';
import { docs } from '../../.source/server';
import { source } from '../../lib/source';

function normalizeDocPath(path: string) {
  return path.replace(/\.mdx?$/, '').replace(/^docs\//, '').replace(/\/index$/, '');
}

export default async function DocPage(props: { params: Promise<{ slug: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug) ?? source.getPage([...params.slug, 'index']);
  if (!page) notFound();

  const targetPath = params.slug.join('/');
  const doc = docs.docs.find((entry) => normalizeDocPath(entry.info.path) === targetPath);
  if (!doc) notFound();

  const MDX = doc.body;

  return (
    <DocsLayout tree={source.pageTree}>
      <DocsPage toc={doc.toc} full={doc.full}>
        <DocsBody>
          <MDX />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}

export async function generateStaticParams() {
  return source.generateParams()
    .filter((params) => (params.slug?.length ?? 0) > 0)
    .map((params) => ({
      ...params,
      slug: params.slug?.[params.slug.length - 1] === 'index' ? params.slug.slice(0, -1) : params.slug,
    }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
