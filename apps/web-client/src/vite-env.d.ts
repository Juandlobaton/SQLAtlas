/// <reference types="vite/client" />

declare const __IS_DEMO__: boolean;

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE: string;
  readonly VITE_API_BASE: string;
  readonly VITE_PARSER_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
