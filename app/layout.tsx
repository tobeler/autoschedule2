import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '@/styles/colors_and_type.css';
import '@/styles/app.css';
import '@/styles/app-views.css';
import '@/styles/view-attention.css';
import '@/styles/view-projects.css';

export const metadata: Metadata = {
  title: 'Jetson · Schedule + Dispatch',
  description: 'Jetson field service management — schedule, dispatch, and crew assignment.',
  icons: {
    icon: '/logos/Jetson-Logo-Green.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
