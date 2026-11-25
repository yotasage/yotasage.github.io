// Plots gallery state & guaranteed leak-free Blob URL lifecycle hook.
// Caps rendered PNG history at 120 plots and revokes Blob URLs synchronously on eviction,
// per-item delete, Clear all, and unmount.

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlotSource } from '../../lib/python/protocol';
import type { PlotEvent } from '../../lib/python/workerClient';

export const MAX_GALLERY_PLOTS = 120;

export interface PlotGalleryItem {
  readonly plotId: string;
  readonly index: number;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly source: PlotSource;
  readonly canExportVector: boolean;
  readonly createdAt: number;
  readonly blobUrl: string;
  readonly pngBytes: Uint8Array;
}

export function usePlots(isPlotsVisibleRef: React.RefObject<boolean>) {
  const [plots, setPlots] = useState<readonly PlotGalleryItem[]>([]);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const itemsRef = useRef<PlotGalleryItem[]>([]);
  const activeUrlsRef = useRef<Set<string>>(new Set());
  const nextIndexRef = useRef(1);

  const revokeUrl = useCallback((url: string) => {
    if (activeUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      activeUrlsRef.current.delete(url);
    }
  }, []);

  const addPlot = useCallback(
    (event: PlotEvent) => {
      const copy = new Uint8Array(event.pngBytes.byteLength);
      copy.set(event.pngBytes);
      const blob = new Blob([copy], { type: 'image/png' });
      const blobUrl = URL.createObjectURL(blob);
      activeUrlsRef.current.add(blobUrl);

      const item: PlotGalleryItem = {
        plotId: event.plotId,
        index: nextIndexRef.current++,
        title: event.title,
        width: event.width,
        height: event.height,
        source: event.source,
        canExportVector: event.canExportVector,
        createdAt: event.createdAt,
        blobUrl,
        pngBytes: copy,
      };

      const next = [...itemsRef.current, item];
      if (next.length > MAX_GALLERY_PLOTS) {
        const overflow = next.length - MAX_GALLERY_PLOTS;
        const evicted = next.splice(0, overflow);
        for (const old of evicted) {
          revokeUrl(old.blobUrl);
        }
      }

      itemsRef.current = next;
      setPlots(next);
      setSelectedPlotId(item.plotId);

      if (!isPlotsVisibleRef.current) {
        setUnreadCount((c) => c + 1);
      }
    },
    [isPlotsVisibleRef, revokeUrl],
  );

  const deletePlot = useCallback(
    (plotId: string) => {
      const current = itemsRef.current;
      const idx = current.findIndex((p) => p.plotId === plotId);
      if (idx < 0) return;

      const [removed] = current.slice(idx, idx + 1);
      revokeUrl(removed.blobUrl);

      const next = current.filter((p) => p.plotId !== plotId);
      itemsRef.current = next;
      setPlots(next);
      setSelectedPlotId((prev) => {
        if (prev !== plotId) return prev;
        if (next.length === 0) return null;
        return next[Math.min(idx, next.length - 1)].plotId;
      });
    },
    [revokeUrl],
  );

  const clearAllPlots = useCallback(() => {
    for (const item of itemsRef.current) {
      revokeUrl(item.blobUrl);
    }
    for (const url of [...activeUrlsRef.current]) {
      URL.revokeObjectURL(url);
    }
    activeUrlsRef.current.clear();
    itemsRef.current = [];
    setPlots([]);
    setSelectedPlotId(null);
    setUnreadCount(0);
  }, [revokeUrl]);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Guarantee zero Blob URL leaks on unmount
  useEffect(() => {
    const urls = activeUrlsRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  return {
    plots,
    selectedPlotId,
    unreadCount,
    addPlot,
    selectPlot: setSelectedPlotId,
    deletePlot,
    clearAllPlots,
    clearUnread,
  };
}
