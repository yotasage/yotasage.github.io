import { Head, Html, Main, NextScript } from 'next/document';
import React from 'react';

// Runs synchronously before React hydration so v2 pages render in the user's saved
// Light / Dark / High Contrast theme on the very first paint without flashing.
// Legacy pages do not carry [data-ds-page="v2"] or [data-ds="v2"], so this attribute
// has zero effect on them.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('site.theme');if(t!=='light'&&t!=='dark'&&t!=='hc'){var ks=['resistor.theme','smith.theme','emsim.theme'];t=null;for(var i=0;i<ks.length;i++){var v=localStorage.getItem(ks[i]);if(v==='light'||v==='dark'){t=v;break;}}}var r=(t==='light'||t==='dark'||t==='hc')?t:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.dsTheme=r;var l=localStorage.getItem('site.lang');if(l==='en'||l==='nb'){document.documentElement.lang=l;}var ms=Number(localStorage.getItem('ds.mathScale'));if(isFinite(ms)&&ms>=60&&ms<=300){document.documentElement.style.setProperty('--ds-math-scale',String(Math.round(ms)/100));}}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="google-site-verification" content="nXa_1-KjP-Lv3u15HNRAq-INkpkJOxCJKNuojbb-qMA" />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
