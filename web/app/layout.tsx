import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Terrastra', template: '%s · Terrastra' },
  description: 'Geography and astronomy on a living 3D globe.',
  icons: { icon: '/favicon.svg' },
  robots: { index: false },
};
export const viewport: Viewport = { themeColor: '#09090b', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
