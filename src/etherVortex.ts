/**
 * Ether vortex on the board — hexon-sized feature like terrain, with domain tint and crystal count.
 */

import { Hex } from './hex';

import creationIcon from './assets/ether-vortex-domains/creation.webp?url';
import deathIcon from './assets/ether-vortex-domains/death.webp?url';
import destructionIcon from './assets/ether-vortex-domains/destruction.webp?url';
import lifeIcon from './assets/ether-vortex-domains/life.webp?url';

export type EtherVortexDomainId = 'life' | 'creation' | 'death' | 'destruction';

export type EtherVortexState = {
  center: Hex;
  etherCrystals: number;
  domain: EtherVortexDomainId | null;
  /** Visual rotation of the hexon texture (degrees), independent per vortex. */
  rotationDeg: number;
  /** Optional sprite override per-vortex (defaults to render config image). */
  spriteSrc?: string;
  /** Optional texture-only rotation (degrees), independent from footprint rotation. */
  imageRotationDeg?: number;
  /** If set, vortex is off-board at this world position. */
  offBoardWorld?: { x: number; y: number };
};

const DOMAIN_ICON_SRC: Record<EtherVortexDomainId, string> = {
  life: lifeIcon,
  creation: creationIcon,
  death: deathIcon,
  destruction: destructionIcon,
};

export const ETHER_VORTEX_DOMAINS: readonly {
  id: EtherVortexDomainId;
  label: string;
  imageSrc: string;
  /** Opaque fill for canvas `globalCompositeOperation: 'color'` over the vortex texture. */
  blendColor: string;
}[] = [
  { id: 'life', label: 'Жизнь', imageSrc: DOMAIN_ICON_SRC.life, blendColor: 'rgb(46, 160, 67)' },
  { id: 'creation', label: 'Созидание', imageSrc: DOMAIN_ICON_SRC.creation, blendColor: 'rgb(255, 152, 0)' },
  { id: 'death', label: 'Смерть', imageSrc: DOMAIN_ICON_SRC.death, blendColor: 'rgb(142, 36, 170)' },
  { id: 'destruction', label: 'Разрушение', imageSrc: DOMAIN_ICON_SRC.destruction, blendColor: 'rgb(229, 57, 53)' },
] as const;

const blendColorById = new Map<EtherVortexDomainId, string>(
  ETHER_VORTEX_DOMAINS.map((d) => [d.id, d.blendColor]),
);

export function getEtherVortexBlendColor(domain: EtherVortexDomainId | null): string | null {
  if (domain === null) return null;
  return blendColorById.get(domain) ?? null;
}

/** Same footprint as terrain / big mini: center + six neighbors. */
export function etherVortexFootprint(center: Hex): Hex[] {
  return [center, ...Hex.directions.map((d) => center.add(d))];
}

/** Half-edge of the crystal rhombus in board/world space (scales with camera zoom). */
export function etherVortexCrystalBadgeHalfWorld(layout: { size: { y: number } }): number {
  return layout.size.y * (0.46 / 1.5);
}

/** Hit-test radius in board space around the chip center. */
export function etherVortexCrystalBadgeHitRadiusWorld(layout: { size: { y: number } }): number {
  return layout.size.y * (0.76 / 1.5);
}
