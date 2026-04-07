/// <reference types="vite/client" />

/** Chromium: сохраняем prompt() для кастомной кнопки установки PWA. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

interface ImportMetaEnv {
  readonly VITE_MP_WS_URL?: string;
  /** JSON array of RTCIceServer for WebRTC voice (optional; default STUN). */
  readonly VITE_RTC_ICE_SERVERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
