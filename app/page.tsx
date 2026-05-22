'use client';

import dynamic from 'next/dynamic';

// Dispatcher is a pure client app today (Zustand + localStorage). Bypass SSR
// entirely so we never serialize an empty store snapshot during HTML render.
const App = dynamic(() => import('@/App'), { ssr: false });

export default function Page() {
  return <App />;
}
