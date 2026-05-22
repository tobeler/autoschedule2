// =============================================================
// Single Next.js catchall that delegates every method to the
// Hono app. Every /api/v1/* request lands here.
// =============================================================
import type { NextRequest } from 'next/server';

import { app } from '@/api/app';

export const runtime = 'nodejs';
// Force per-request execution; the Hono app reads the request body and
// touches Postgres on every call.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return app.fetch(req);
}
export async function POST(req: NextRequest) {
  return app.fetch(req);
}
export async function PATCH(req: NextRequest) {
  return app.fetch(req);
}
export async function PUT(req: NextRequest) {
  return app.fetch(req);
}
export async function DELETE(req: NextRequest) {
  return app.fetch(req);
}
export async function HEAD(req: NextRequest) {
  return app.fetch(req);
}
export async function OPTIONS(req: NextRequest) {
  return app.fetch(req);
}
