import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inworld Voice Studio',
  description: 'Explore and compare Inworld AI text-to-speech voices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
