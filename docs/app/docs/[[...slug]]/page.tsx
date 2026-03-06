import { DocsBody, DocsPage } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { docs } from '../../../.source/server';
import { source } from '../../../lib/source';

export default async function DocPage(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const targetPath = params.slug?.length ? params.slug.join('/') : 'index';
  const doc = docs.docs.find((entry) => entry.info.path.replace(/\.mdx?$/, '') === targetPath);
  if (!doc) notFound();

  const MDX = doc.body;

  return (
    <DocsPage toc={doc.toc} full={doc.full}>
      <DocsBody>
        <MDX />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
