/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow dev access from LAN + Tailscale so we can demo over the tailnet.
  // Without this, Next.js blocks cross-origin requests in dev with a CSRF warning.
  allowedDevOrigins: [
    'mac-mini',
    'mac-mini.tail79e005.ts.net',
    'mac-mini.local',
    '*.ts.net',
    '*.local',
    '192.168.1.242',
    '100.80.5.82',
  ],
};

export default nextConfig;
