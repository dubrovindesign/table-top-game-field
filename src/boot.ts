/**
 * Lightweight entry: boot overlay + preload (parallel with main chunk), then the full app (main).
 */

import './bootScreen.css';
import { runInitialBootScreen } from './bootScreen.ts';

const mainModulePromise = import('./main.ts');
await runInitialBootScreen({ mainModulePromise });
