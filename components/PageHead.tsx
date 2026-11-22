import Head from 'next/head';

import { getPageMeta, getProjectMeta } from '../lib/citation';

export const SITE_ORIGIN = 'https://yotasage.github.io';

export interface PageHeadProps {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  ogAlt?: string;
  themeColor?: string;
  noIndex?: boolean;
}

export default function PageHead({
  title,
  description,
  path,
  ogImage = '/og/home.png',
  ogAlt,
  themeColor,
  noIndex,
}: PageHeadProps) {
  const fullTitle = /yotasage/i.test(title) ? title : `${title} · yotasage`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const canonicalUrl = normalizedPath === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${normalizedPath}`;
  const normalizedOgImage = ogImage.startsWith('/') ? ogImage : `/${ogImage}`;
  const ogImageUrl = `${SITE_ORIGIN}${normalizedOgImage}`;
  const imageAlt = ogAlt ?? fullTitle;
  const pageMeta = getPageMeta(normalizedPath);
  const projectMeta = getProjectMeta();

  return (
    <Head>
      <title key="title">{fullTitle}</title>
      <meta key="description" name="description" content={description} />
      <link key="canonical" rel="canonical" href={canonicalUrl} />
      <link key="icon" rel="icon" href="/favicon.ico" />
      <meta key="og:site_name" property="og:site_name" content="yotasage.github.io" />
      <meta key="og:type" property="og:type" content="website" />
      <meta key="og:title" property="og:title" content={fullTitle} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:url" property="og:url" content={canonicalUrl} />
      <meta key="og:image" property="og:image" content={ogImageUrl} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />
      <meta key="og:image:alt" property="og:image:alt" content={imageAlt} />
      <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      <meta key="twitter:title" name="twitter:title" content={fullTitle} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={ogImageUrl} />
      <meta key="citation_title" name="citation_title" content={pageMeta.title} />
      <meta key="citation_author" name="citation_author" content={projectMeta.author} />
      {pageMeta.lastChanged && (
        <meta key="citation_online_date" name="citation_online_date" content={pageMeta.lastChanged} />
      )}
      <meta key="citation_public_url" name="citation_public_url" content={canonicalUrl} />
      {themeColor && <meta key="theme-color" name="theme-color" content={themeColor} />}
      {noIndex && <meta key="robots" name="robots" content="noindex" />}
    </Head>
  );
}
