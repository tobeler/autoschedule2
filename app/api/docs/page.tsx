// =============================================================
// Scalar UI for our OpenAPI spec. Pulls the live spec from
// /api/v1/openapi.json so the docs page is always in sync with
// the running server.
// =============================================================
'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';

export default function ApiDocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        url: '/api/v1/openapi.json',
        theme: 'default',
        layout: 'modern',
      }}
    />
  );
}
