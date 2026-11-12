import type { Metadata, Viewport } from 'next';
import { Roboto, Roboto_Mono } from 'next/font/google';
import './globals.css';

const robotoSans = Roboto({
  subsets: ['cyrillic', 'latin'],
  display: 'swap',
  variable: '--font-roboto-sans',
  weight: ['400', '500', '700'],
});

const robotoMono = Roboto_Mono({
  subsets: ['cyrillic', 'latin'],
  display: 'swap',
  variable: '--font-roboto-mono',
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'WHPP API — Проверка баланса токенов',
  description: 'Проверьте остаток токенов по личному коду доступа',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${robotoSans.variable} ${robotoMono.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}