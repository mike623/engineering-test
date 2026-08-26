import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Geist } from 'next/font/google';
import { NavLink } from '@/components/nav-link';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Eurocamp',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <nav className="mx-auto flex max-w-4xl items-center gap-1 px-6 py-3">
            <span className="mr-3 font-semibold tracking-tight">Eurocamp</span>
            <NavLink href="/">Parcs</NavLink>
            <NavLink href="/users">Users</NavLink>
            <NavLink href="/bookings">Bookings</NavLink>
          </nav>
        </header>
        <div className="px-6 py-8">{children}</div>
      </body>
    </html>
  );
}
