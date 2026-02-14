interface ImportMetaEnv {
    readonly VITE_API_BASE_URL: string;
    readonly VITE_VIDEO_UPLOAD_MAX_SIZE: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  