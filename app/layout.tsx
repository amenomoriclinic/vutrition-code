import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '栄養管理アプリ',
  description: '写真から栄養推定と日次集計を行う個人用栄養管理アプリ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
