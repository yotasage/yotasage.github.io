// A place where panel hosts are shown (a dock group's body, a phone pane). It never renders panels: it
// claims their hosts from the registry (usePanelHosts.ts), which moves the host nodes into it.
import { useLayoutEffect, useRef } from 'react';
import type { HTMLAttributes } from 'react';

import type { PanelId } from '../../../lib/python/layout/model';
import type { HostRegistry } from './usePanelHosts';

interface Props extends HTMLAttributes<HTMLDivElement> {
  readonly registry: HostRegistry;
  readonly panels: readonly PanelId[];
  readonly shown: PanelId | null;
}

export default function HostSlot({ registry, panels, shown, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const key = panels.join(',');
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) registry.claim(el, key ? (key.split(',') as PanelId[]) : [], shown);
  }, [registry, key, shown]);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (el) registry.release(el);
    };
  }, [registry]);
  return <div ref={ref} {...rest} />;
}
