/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_ALCHEMY_KEY?: string;
  readonly VITE_PINATA_JWT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
