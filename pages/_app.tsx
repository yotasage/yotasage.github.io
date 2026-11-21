import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import React from 'react';

import '../styles/design-system.css';
import SiteFooter from '../components/SiteFooter';
import { I18nProvider } from '../lib/ui/i18n';
import { ModeProvider } from '../lib/ui/mode';
import { ThemeProvider } from '../lib/ui/theme';

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  return (
    <ThemeProvider>
      <ModeProvider>
        <I18nProvider>
          <Component {...pageProps} />
          {/* Always in view on the main page; on the tool pages it comes after the tool, which saves height. */}
          <SiteFooter fixed={pathname === '/'} />
        </I18nProvider>
      </ModeProvider>
    </ThemeProvider>
  );
}
