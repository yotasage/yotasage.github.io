import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import React from 'react';

import SiteFooter from '../components/SiteFooter';

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  return (
    <>
      <Component {...pageProps} />
      {/* Always in view on the main page; on the tool pages it comes after the tool, which saves height. */}
      <SiteFooter fixed={pathname === '/'} />
    </>
  );
}
