/**
 * Ether vortex on the board — hexon-sized feature like terrain, with domain tint and crystal count.
 */

import { Hex } from './hex';

export type EtherVortexDomainId = 'life' | 'creation' | 'death' | 'destruction';

export type EtherVortexState = {
  center: Hex;
  etherCrystals: number;
  domain: EtherVortexDomainId | null;
  /** Visual rotation of the hexon texture (degrees), independent per vortex. */
  rotationDeg: number;
  /** If set, vortex is off-board at this world position. */
  offBoardWorld?: { x: number; y: number };
};

export const ETHER_VORTEX_DOMAINS: readonly {
  id: EtherVortexDomainId;
  label: string;
  imageSrc: string;
  /** Opaque fill for canvas `globalCompositeOperation: 'color'` over the vortex texture. */
  blendColor: string;
}[] = [
  { id: 'life', label: 'Жизнь', imageSrc: '/life.webp', blendColor: 'rgb(46, 160, 67)' },
  { id: 'creation', label: 'Созидание', imageSrc: '/creation.webp', blendColor: 'rgb(255, 152, 0)' },
  { id: 'death', label: 'Смерть', imageSrc: '/death.webp', blendColor: 'rgb(142, 36, 170)' },
  { id: 'destruction', label: 'Разрушение', imageSrc: '/destruction.webp', blendColor: 'rgb(229, 57, 53)' },
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
  return layout.size.y * 0.23;
}

/** Hit-test radius in board space around the chip center. */
export function etherVortexCrystalBadgeHitRadiusWorld(layout: { size: { y: number } }): number {
  return layout.size.y * 0.38;
}
