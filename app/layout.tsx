import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import './globals.css';

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://questforge-ai.openai.site'),
  title: 'QuestForge AI — Forge Your Next Quest',
  description: 'Transform ambitious goals into adaptive, burnout-resilient RPG quest lines.',
  openGraph: {
    title: 'QuestForge AI — Forge Your Next Quest',
    description: 'Transform ambitious goals into adaptive, burnout-resilient RPG quest lines.',
    images: [{ url: '/og.png', width: 1680, height: 960, alt: 'QuestForge AI retro quest map' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QuestForge AI — Forge Your Next Quest',
    description: 'Transform ambitious goals into adaptive, burnout-resilient RPG quest lines.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={geistMono.variable}
      >
        {children}
      </body>
    </html>
  );
}
