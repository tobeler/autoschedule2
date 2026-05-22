import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: 'sparkle' | 'home' | string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <svg viewBox="0 0 200 120" width="180" height="108" fill="none">
          <defs>
            <linearGradient id="empty-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#CBFF8A" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3CD567" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="200" height="120" rx="20" fill="url(#empty-sky)" />
          <path
            d="M 40 80 L 100 38 L 160 80 L 160 100 L 40 100 Z"
            fill="#FBFAF1"
            stroke="#113823"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M 40 80 L 100 38 L 160 80" stroke="#113823" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
          <rect x="86" y="68" width="20" height="32" rx="2" fill="#3CD567" stroke="#113823" strokeWidth="2" />
          <circle cx="102" cy="84" r="1.6" fill="#113823" />
          <rect x="55" y="68" width="14" height="14" rx="1.5" fill="#CBFF8A" stroke="#113823" strokeWidth="1.6" />
          <rect x="130" y="68" width="14" height="14" rx="1.5" fill="#CBFF8A" stroke="#113823" strokeWidth="1.6" />
          <rect x="146" y="86" width="22" height="14" rx="2" fill="#113823" />
          <circle cx="157" cy="93" r="3" fill="#FBFAF1" />
          {icon === 'sparkle' && (
            <path d="M 100 18 L 102 24 L 108 26 L 102 28 L 100 34 L 98 28 L 92 26 L 98 24 Z" fill="#3CD567" />
          )}
        </svg>
      </div>
      <div className="h4" style={{ marginTop: 8 }}>{title}</div>
      {body && <div className="muted small">{body}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
