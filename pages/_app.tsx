import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import React from 'react';

import '../styles/design-system.css';
import ShareModal from '../components/Share/ShareModal';
import SiteFooter from '../components/SiteFooter';
import { I18nProvider } from '../lib/ui/i18n';
import { LayoutProvider } from '../lib/ui/layout';
import { MathSettingsProvider } from '../lib/ui/mathSettings';
import { ModeProvider } from '../lib/ui/mode';
import { ShareModalProvider } from '../lib/ui/shareModal';
import { ThemeProvider } from '../lib/ui/theme';

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  return (
    <ThemeProvider>
      <LayoutProvider>
        <ModeProvider>
          <MathSettingsProvider>
            <I18nProvider>
              <ShareModalProvider>
                <Component {...pageProps} />
                {/* Always in view on the main page; on the tool pages it comes after the tool, which saves height. */}
                <SiteFooter fixed={pathname === '/'} />
                <ShareModal />
              </ShareModalProvider>
            </I18nProvider>
          </MathSettingsProvider>
        </ModeProvider>
      </LayoutProvider>
    </ThemeProvider>
  );
}
