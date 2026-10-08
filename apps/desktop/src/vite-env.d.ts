/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CDS_BASE_URL?: string;
  readonly VITE_DRIFT_PRO_PRODUCT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
