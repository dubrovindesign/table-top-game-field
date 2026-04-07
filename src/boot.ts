/**
 * Lightweight entry: boot overlay + preload, then the full app (main).
 */

import './bootScreen.css';
import { runInitialBootScreen } from './bootScreen.ts';

await runInitialBootScreen();
await import('./main.ts');
