import Image from 'next/image';
import { DocsBody, DocsPage } from 'fumadocs-ui/page';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { notFound } from 'next/navigation';
import { docs } from '../.source/server';
import { source } from '../lib/source';

const sidebarHero = (
  <div className="docs-sidebar-hero">
    <Image
      src="/chaton-hero.gif"
      alt="Chatons hero"
      width={640}
      height={360}
      priority
      className="w-full"
      unoptimized
    />
  </div>
);

function normalizeDocPath(path: string) {
  return path.replace(/\.mdx?$/, '').replace(/^docs\//, '');
}

export default function HomePage() {
  const doc = docs.docs.find((entry) => normalizeDocPath(entry.info.path) === 'index');
  if (!doc) notFound();

  const MDX = doc.body;

  return (
    <DocsLayout tree={source.pageTree} sidebar={{ banner: sidebarHero }}>
      <DocsPage toc={doc.toc} full={doc.full}>
        <DocsBody>
          <MDX />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}
