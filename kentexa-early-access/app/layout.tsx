import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import LanguageProviderClient from '@/components/LanguageProviderClient';
import MetaPixel from '@/components/MetaPixel';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Kentexa Early Access Portal',
  description:
    "Join Kentexa Before Launch — become one of the first businesses, service providers, transporters, and agents on Tanzania's next AI-powered marketplace.",
};

// Without this, mobile browsers fall back to a ~980px desktop-width layout
// viewport and scale the whole page down to fit — the site "renders" but
// every section overflows horizontally, cut off exactly at the phone's
// screen edge. This app previously had no viewport export at all (and this
// Next.js version doesn't appear to inject a default), so this was almost
// certainly the biggest single blocker to mobile conversion, independent of
// form length — most of this campaign's traffic is on phones.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Inline script to set the theme class before React hydrates, avoiding a
// flash of the wrong theme. Respects a stored preference first, then falls
// back to the system preference.
const themeInitScript = `
(function() {
  try {
    var stored = window.localStorage.getItem('kentexa_ea_theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={inter.className}>
        <MetaPixel />
        <LanguageProviderClient>{children}</LanguageProviderClient>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '10px',
            },
          }}
        />
      </body>
    </html>
  );
}
