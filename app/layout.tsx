import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'QuestForge AI — Strategic Roadmaps, Generated',
  description: 'Turn complex goals into clear, actionable AI-generated strategic roadmaps.',
  openGraph: {
    title: 'QuestForge AI — Strategic Roadmaps, Generated',
    description: 'Turn complex goals into clear, actionable AI-generated strategic roadmaps.',
    images: [],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QuestForge AI — Strategic Roadmaps, Generated',
    description: 'Turn complex goals into clear, actionable AI-generated strategic roadmaps.',
    images: [],
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
        className={geist.variable}
      >
        {children}
      </body>
    </html>
  );
}
