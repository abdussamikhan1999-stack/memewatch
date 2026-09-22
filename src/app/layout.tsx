import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'memewatch',
  description: 'Trending Solana meme coin hype & risk scanner',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <strong>memewatch</strong> — informational only, not financial advice. Data
          sources are best-effort and not guaranteed accurate or complete.
        </header>
        {children}
      </body>
    </html>
  );
}
