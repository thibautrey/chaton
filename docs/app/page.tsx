import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>Chatons Documentation</h1>
      <p>Documentation migrated to a Fumadocs structure.</p>
      <p>
        <Link href="/docs">Open documentation</Link>
      </p>
    </main>
  );
}
