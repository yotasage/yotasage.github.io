import type { ToolId } from '../../lib/paint/types';

interface IconProps {
  size?: number;
}

export function ToolSvgIcon({ tool, size = 17 }: { tool: ToolId; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (tool) {
    case 'select':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" strokeDasharray="3 3" rx="1" />
        </svg>
      );
    case 'move':
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18" />
          <path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
        </svg>
      );
    case 'crop':
      return (
        <svg {...common}>
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </svg>
      );
    case 'brush':
      return (
        <svg {...common}>
          <path d="m18.5 3.5 2 2-9.5 9.5-3 1 1-3z" />
          <path d="M7.5 16.5c-1.8 0-3 1.2-3 2.8 0 1-.8 1.7-1.8 1.7 1.2 1 3 1.5 4.8 1.5 2.5 0 4-1.4 4-3.5 0-1.4-1.2-2.5-2.5-2.5z" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      );
    case 'eraser':
      return (
        <svg {...common}>
          <path d="m7 21-4.3-4.3a2 2 0 0 1 0-2.8L13.6 3a2 2 0 0 1 2.8 0l4.9 4.9a2 2 0 0 1 0 2.8L11 21Z" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </svg>
      );
    case 'fill':
      return (
        <svg {...common}>
          <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0Z" />
          <path d="m5 2 5 5" />
          <path d="M2 13h15" />
          <path d="M21 17c0 1.7-1.1 3-2.5 3S16 18.7 16 17c0-1.3 2.5-4 2.5-4s2.5 2.7 2.5 4Z" />
        </svg>
      );
    case 'picker':
      return (
        <svg {...common}>
          <path d="m2 22 1-1h3l9-9" />
          <path d="M3 21v-3l9-9" />
          <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
        </svg>
      );
    case 'line':
      return (
        <svg {...common}>
          <path d="M4 20 20 4" />
          <circle cx="4" cy="20" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="20" cy="4" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'rect':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" rx="1.5" />
        </svg>
      );
    case 'ellipse':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="6.5" />
        </svg>
      );
    case 'text':
      return (
        <svg {...common}>
          <path d="M4 7V5h16v2" />
          <path d="M12 5v14" />
          <path d="M9 19h6" />
        </svg>
      );
    case 'pan':
      return (
        <svg {...common}>
          <path d="M18 11V6a1.5 1.5 0 0 0-3 0v4" />
          <path d="M15 10V5a1.5 1.5 0 0 0-3 0v5" />
          <path d="M12 10V6a1.5 1.5 0 0 0-3 0v8" />
          <path d="M9 14l-1.8-2.2a1.4 1.4 0 0 0-2.2 1.8l3.5 5.2A4 4 0 0 0 11.8 21h2.7a4.5 4.5 0 0 0 4.5-4.5v-5a1.5 1.5 0 0 0-3 0" />
        </svg>
      );
  }
}

export function UndoIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function RedoIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}

export function FloatIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="3" width="13" height="13" rx="2" />
      <path d="M16 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function DockLeftIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <rect x="4" y="4" width="4" height="16" fill="currentColor" stroke="none" opacity={0.35} />
    </svg>
  );
}

export function DockRightIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
      <rect x="16" y="4" width="4" height="16" fill="currentColor" stroke="none" opacity={0.35} />
    </svg>
  );
}

export function CloseIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function EyeIcon({ visible, size = 14 }: { visible: boolean; size?: number }) {
  return visible ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13 13 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
