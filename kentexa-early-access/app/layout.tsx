import type { Metadata } from 'next';
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
