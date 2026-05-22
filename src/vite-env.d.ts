/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUBSPOT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
