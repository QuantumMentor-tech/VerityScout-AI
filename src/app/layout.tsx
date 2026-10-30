import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VerityScout AI — Research & Verification Engine',
  description: 'Autonomous multi-source web research, source-linked evidence extraction, and deterministic constraint verification platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
