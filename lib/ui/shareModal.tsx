import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface ShareModalContextValue {
  open: boolean;
  openShareModal: (triggerEl?: HTMLElement | null) => void;
  closeShareModal: () => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const ShareModalContext = createContext<ShareModalContextValue | null>(null);

export function ShareModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openShareModal = useCallback((triggerEl?: HTMLElement | null) => {
    if (triggerEl) {
      triggerRef.current = triggerEl;
    } else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }
    setOpen(true);
  }, []);

  const closeShareModal = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo<ShareModalContextValue>(
    () => ({
      open,
      openShareModal,
      closeShareModal,
      triggerRef,
    }),
    [open, openShareModal, closeShareModal],
  );

  return <ShareModalContext.Provider value={value}>{children}</ShareModalContext.Provider>;
}

export function useShareModal(): ShareModalContextValue {
  const ctx = useContext(ShareModalContext);
  if (!ctx) {
    throw new Error('useShareModal must be used within a ShareModalProvider');
  }
  return ctx;
}
