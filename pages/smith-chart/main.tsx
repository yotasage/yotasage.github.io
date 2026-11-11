import Head from 'next/head';
import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import HomeIcon from '../../components/icons/home';
import Grid from '../../components/Smith/Grid';
import { fitK } from '../../components/Smith/gridSvg';
import { MODE_Y, MODE_Z, MODE_ZY } from '../../lib/smith/grid';
import styles from '../../styles/Smith.module.css';

// A bare page to look at the grid (step M2.1b): the mode, a temporary zoom and a few centres. Wheel, pinch and pan
// come with M2.2, the design pass with M2.3.

const MODES = [{ mode: MODE_Z, name: 'Z' }, { mode: MODE_Y, name: 'Y' }, { mode: MODE_ZY, name: 'ZY' }];
const CENTRES: { label: string; x: number; y: number }[] = [
  { label: 'Γ = 0', x: 0, y: 0 },
  { label: 'Γ = 0.5 + j0.3', x: 0.5, y: 0.3 },
  { label: 'Near the short', x: -0.95, y: 0 },
  { label: 'Near the open', x: 0.95, y: 0 },
  { label: 'At the rim, top', x: 0, y: 0.97 },
];

export default function SmithChart() {
  const [mode, setMode] = useState(MODE_Z);
  const [zoomLog, setZoomLog] = useState(0);
  const [centre, setCentre] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const zoom = 2 ** zoomLog;
  const k = fitK(size.w, size.h) * zoom;
  const c = CENTRES[centre];

  return (
    <div className={styles.root}>
      <Head>
        <title>Smith chart</title>
        <meta name="description" content="A Smith chart with impedance, admittance and combined grids whose density follows the zoom." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #f6f4ee;
        }
        @media (prefers-color-scheme: dark) {
          html,
          body {
            background: #2b2b2b;
          }
        }
      `}</style>

      <header className={styles.bar}>
        <Link href="/" className={styles.home} aria-label="Home" title="All tools"><HomeIcon width={17} height={19} color="currentColor" /></Link>
        <h1 className={styles.title}>Smith chart</h1>
      </header>

      <div className={styles.controls}>
        <div className={styles.modes} role="radiogroup" aria-label="Grid">
          {MODES.map(({ mode: m, name }) => (
            <label key={name}>
              <input type="radio" name="smith-mode" value={name} checked={mode === m} onChange={() => setMode(m)} />
              {name}
            </label>
          ))}
        </div>
        <label className={styles.field}>
          Zoom
          <input type="range" min={0} max={10} step={0.25} value={zoomLog} aria-label="Zoom"
            onChange={(e) => setZoomLog(Number(e.target.value))} />
          <span className={styles.num}>{zoom < 10 ? zoom.toFixed(2) : Math.round(zoom)}×</span>
        </label>
        <label className={styles.field}>
          Centre
          <select value={centre} aria-label="Centre" onChange={(e) => setCentre(Number(e.target.value))}>
            {CENTRES.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.chart} ref={box}>
        {size.w > 0 && <Grid cx={c.x} cy={c.y} k={k} width={size.w} height={size.h} mode={mode} />}
      </div>
    </div>
  );
}
