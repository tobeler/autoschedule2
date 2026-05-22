import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow-sm" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <h2 className="page-title">{title}</h2>
        {subtitle && <div className="muted small" style={{ marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div className="row" style={{ marginLeft: 'auto' }}>{children}</div>
    </div>
  );
}
