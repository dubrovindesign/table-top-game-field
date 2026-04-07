/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MP_WS_URL?: string;
  /** JSON array of RTCIceServer for WebRTC voice (optional; default STUN). */
  readonly VITE_RTC_ICE_SERVERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
