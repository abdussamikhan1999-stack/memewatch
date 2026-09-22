export const metadata = {
  title: "Memewatch",
  description: "Track trending Solana meme coins",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
