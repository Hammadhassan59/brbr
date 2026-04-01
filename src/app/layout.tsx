import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from '@/components/providers/language-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#1A1A1A',
};

export const metadata: Metadata = {
  title: "BrBr — Pakistan's Smart Salon System",
  description: 'Bookings, Payments, Staff, Inventory — all in one place. Salon & Barber POS for Pakistan.',
  metadataBase: new URL('https://brbr.pk'),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BrBr',
  },
  openGraph: {
    title: "BrBr — Pakistan's Smart Salon POS System",
    description: 'Bookings, Payments, Staff, Inventory — all in one place',
    siteName: 'BrBr',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-body">
        <LanguageProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </LanguageProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '0',
              background: '#1A1A1A',
              color: '#FFFFFF',
              fontSize: '13px',
              border: '1px solid #2A2A2A',
              fontFamily: 'var(--font-inter)',
            },
          }}
        />
      </body>
    </html>
  );
}
