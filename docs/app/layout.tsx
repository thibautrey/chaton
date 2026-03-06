import type { ReactNode } from 'react';
import './global.css';

export const metadata = {
  title: 'Chatons Documentation',
  description: 'Documentation for Chatons built with Fumadocs',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
