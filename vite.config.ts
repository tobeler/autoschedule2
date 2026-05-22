import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    host: true,
    // Allow any Tailscale (MagicDNS) host + LAN by short name.
    // '.ts.net' is a subdomain wildcard — matches mac-mini.tail79e005.ts.net etc.
    allowedHosts: ['mac-mini', '.ts.net', '.local'],
  },
  build: { outDir: 'dist', sourcemap: true },
});
