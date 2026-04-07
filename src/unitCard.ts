/**
 * Unit Card — displays unit stats, abilities, and info.
 * Appears on the right side of the screen above the dice roller
 * when a unit (small or big) is selected.
 */

import { ETHER_VORTEX_DOMAINS, type EtherVortexDomainId } from './etherVortex';
import { getHotspotsForUnit } from './catalog/catalogOverrides';
import type { HotspotFile, HotspotRegion, LegacyHotspotBinding } from './catalog/hotspotTypes';

// ── Types ──────────────────────────────────────────────────────

export type UnitSize = 'small' | 'big' | 'large' | 'huge';

export type DamageType = 'physical' | 'fire' | 'mental' | 'poison' | 'cold' | 'electric';
export type AttackRange = 'melee' | 'ranged';
/** Same ids as ether vortex domains (`life` | `creation` | `death` | `destruction`). */
export type Domain = EtherVortexDomainId;

/** Ether crystals (cost on action tiles) — red/green/yellow/black/blue. */
export interface EtherCrystalPool {
  red?: number;
  green?: number;
  yellow?: number;
  black?: number;
  blue?: number;
}

/** Dice pool: counts of each colour */
export interface DicePool {
  red?: number;
  green?: number;
  black?: number;
  white?: number;
}

export interface AttackModifier {
  /** 'icon' = triggers on crit, 'text' = always applies if damage lands */
  kind: 'icon' | 'text';
  label: string;
  description?: string;
}

export interface AttackAbility {
  name: string;
  range: number;
  attackRange: AttackRange;
  damageType: DamageType;
  damage: number;
  dice: DicePool;
  modifiers?: AttackModifier[];
  /** Paid in ether crystals to use this attack (when present). */
  etherCost?: EtherCrystalPool;
  /** Shown on the card separately from damage type (ethereal attacks). */
  ethereal?: boolean;
  /** Area / multi-target attack indicator. */
  areaAttack?: boolean;
  /** Override distance unit for this attack’s range (default follows miniature size). */
  attackRangeUnit?: 'hex' | 'hexon';
}

export interface UnitTrait {
  name: string;
  description: string;
}

export interface UnitCardData {
  name: string;
  size: UnitSize;
  health: number;
  maxHealth: number;
  /** Defense dice */
  defense: { white?: number; green?: number };
  walk: number;
  run: number;
  /**
   * Explicit movement distance unit (hexes vs hexons). When omitted, walk/run labels follow `size`
   * like before (small/large → hexes, big/huge → hexons).
   */
  movementDistanceUnit?: 'hex' | 'hexon';
  /** Faction / location banner on the card (path under `public/`). */
  flagSprite?: string;
  /**
   * Faith markers granted on «Получения Веры» (counts by marker colour on the card).
   */
  faithMarkers?: EtherCrystalPool;
  /**
   * Full card art (портрет на боковой карточке, хотспоты по умолчанию).
   * См. `miniatureSprite` — отдельное изображение токена на столе.
   */
  sprite?: string;
  /**
   * Миниатюра на поле / в полосе армии / в кубиках. Если не задано — используется `sprite`.
   */
  miniatureSprite?: string;
  /** Domain affinities (1..4) */
  domains: Domain[];
  /** Concentration: extra dice added when concentrating */
  concentration: DicePool;
  /** Optional ether cost on the concentration tile. */
  concentrationEtherCost?: EtherCrystalPool;
  /** Defense reaction: extra dice added on reaction */
  defenseReaction: { white?: number; green?: number };
  /** Optional ether cost on the defense reaction tile. */
  defenseReactionEtherCost?: EtherCrystalPool;
  /** Exploration: dice pool for exploration checks (optional). */
  exploration?: DicePool;
  /** Optional ether cost on the exploration tile. */
  explorationEtherCost?: EtherCrystalPool;
  /** Range shown on the exploration action (hexes/hexons per `movementDistanceUnit` / size rule). */
  explorationRange?: number;
  /**
   * Max distance for “take / pick up” interactions.
   * Display uses hexes for small & large, hexons for big & huge (same as walk/run).
   */
  grabRange?: number;
  /** Optional ether cost on the «взять» tile. */
  grabEtherCost?: EtherCrystalPool;
  /** Attack abilities */
  attacks: AttackAbility[];
  /** Passive/special traits */
  traits?: UnitTrait[];
  /** Keywords/tags */
  keywords?: string[];
  /** Machine-readable transform target (rules on the table may still use trait text). */
  transformsIntoUnitId?: string;
  /** Army catalog id — used for image-card hotspots overlay. */
  catalogUnitId?: string;
}

/**
 * Board / dice token: `miniatureSprite` → `sprite` → hotspot `image` (если в карточке нет своего art).
 * Не подставляем «чужой» запасной спрайт из-за совпадения sprite с хотспотом — на столе должен
 * быть тот же источник, что и в каталоге/превью.
 */
export function unitMiniatureImageSrc(card: UnitCardData): string | undefined {
  const mini = card.miniatureSprite?.trim();
  if (mini) return mini;
  const sp = card.sprite?.trim();
  if (sp) return sp;
  const cid = card.catalogUnitId;
  if (cid) {
    const hf = getHotspotsForUnit(cid);
    if (hf?.image?.trim()) return hf.image.trim();
  }
  return undefined;
}

/** Army list / editor rows: same resolution order as the table token (incl. hotspot-only units). */
export function unitPanelThumbSrc(card: UnitCardData): string | undefined {
  return unitMiniatureImageSrc(card);
}

export interface DiceRequest {
  pool: DicePool;
  source: UnitCardData;
}

export type UnitCardShowOptions = {
  catalogUnitId?: string;
};

// ── Helpers ────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function rgbStringToHex(rgb: string): string {
  const m = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return '#888888';
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

const DOMAIN_COLORS: Record<Domain, string> = Object.fromEntries(
  ETHER_VORTEX_DOMAINS.map((d) => [d.id, rgbStringToHex(d.blendColor)]),
) as Record<Domain, string>;

/** Подписи доменов (ключи каталога совпадают с `ETHER_VORTEX_DOMAINS`). */
export const DOMAIN_LABELS: Record<Domain, string> = Object.fromEntries(
  ETHER_VORTEX_DOMAINS.map((d) => [d.id, d.label]),
) as Record<Domain, string>;

const DAMAGE_TYPE_ICONS: Record<DamageType, string> = {
  physical: '\u2694',
  fire: '\uD83D\uDD25',
  mental: '\uD83E\uDDE0',
  poison: '\u2620',
  cold: '\u2744',
  electric: '\u26A1',
};

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  physical: 'Physical',
  fire: 'Fire',
  mental: 'Mental',
  poison: 'Poison',
  cold: 'Cold',
  electric: 'Electric',
};

const DICE_COLORS: Record<string, string> = {
  red: '#e53935',
  green: '#43a047',
  black: '#424242',
  white: '#e0e0e0',
  yellow: '#fdd835',
  blue: '#1e88e5',
};

function dicePoolTotal(pool: DicePool): number {
  return (pool.red ?? 0) + (pool.green ?? 0) + (pool.black ?? 0) + (pool.white ?? 0);
}

function etherCrystalTotal(pool: EtherCrystalPool): number {
  return (
    (pool.red ?? 0) +
    (pool.green ?? 0) +
    (pool.yellow ?? 0) +
    (pool.black ?? 0) +
    (pool.blue ?? 0)
  );
}

function renderEtherCrystalPool(pool: EtherCrystalPool, container: HTMLElement): void {
  const entries = Object.entries(pool).filter(([, v]) => v && v > 0) as [string, number][];
  for (const [color, count] of entries) {
    const group = el('span', 'uc-dice-group');
    for (let i = 0; i < count; i++) {
      const c = el('span', 'uc-ether-crystal');
      c.style.background = DICE_COLORS[color] ?? '#666';
      if (color === 'yellow') c.style.border = '1px solid rgba(0,0,0,0.25)';
      group.appendChild(c);
    }
    container.appendChild(group);
  }
}

function renderDicePool(pool: DicePool, container: HTMLElement): void {
  const entries = Object.entries(pool).filter(([, v]) => v && v > 0) as [string, number][];
  for (const [color, count] of entries) {
    const group = el('span', 'uc-dice-group');
    for (let i = 0; i < count; i++) {
      const die = el('span', 'uc-die');
      die.style.background = DICE_COLORS[color] ?? '#666';
      if (color === 'white') die.style.border = '1px solid rgba(255,255,255,0.3)';
      group.appendChild(die);
    }
    container.appendChild(group);
  }
}

function renderDefenseDice(def: { white?: number; green?: number }, container: HTMLElement): void {
  renderDicePool({ white: def.white, green: def.green }, container);
}

const HEX_DISTANCE_ICON_SRC = '/hex-icon.svg';
const HEXON_DISTANCE_ICON_SRC = '/hexon-icon.svg';

function movementDistanceUnit(data: UnitCardData): 'hex' | 'hexon' {
  if (data.movementDistanceUnit === 'hex') return 'hex';
  if (data.movementDistanceUnit === 'hexon') return 'hexon';
  return data.size === 'big' || data.size === 'huge' ? 'hexon' : 'hex';
}

function attackRangeDistanceUnit(data: UnitCardData, atk: AttackAbility): 'hex' | 'hexon' {
  if (atk.attackRangeUnit === 'hex') return 'hex';
  if (atk.attackRangeUnit === 'hexon') return 'hexon';
  return movementDistanceUnit(data);
}

/** Range in hexes/hexons: outline icon with the number centered inside. */
function appendDistanceBadge(parent: HTMLElement, value: number, unit: 'hex' | 'hexon'): void {
  const wrap = el('span', `uc-distance-badge uc-distance-badge--${unit}`);
  const img = document.createElement('img');
  img.className = 'uc-distance-badge-icon';
  img.src = unit === 'hex' ? HEX_DISTANCE_ICON_SRC : HEXON_DISTANCE_ICON_SRC;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  wrap.appendChild(img);
  wrap.appendChild(el('span', 'uc-distance-badge-value', String(value)));
  parent.appendChild(wrap);
}

function appendOptionalEtherCostRow(info: HTMLElement, cost: EtherCrystalPool | undefined): void {
  if (!cost || etherCrystalTotal(cost) === 0) return;
  const row = el('div', 'uc-stat-ether');
  row.appendChild(document.createTextNode('Эфир: '));
  renderEtherCrystalPool(cost, row);
  info.appendChild(row);
}

// ── UnitCard class ─────────────────────────────────────────────

export class UnitCard {
  private container: HTMLElement;
  private visible = false;
  private dockedImageLayoutCleanup: (() => void) | null = null;
  /** Avoids full DOM rebuild every frame when docked card is unchanged (preserves image scroll). */
  private lastDockedShowKey: string | null = null;
  /** Called when a dice-bearing element is clicked on the card. */
  onDiceRequest: ((req: DiceRequest) => void) | null = null;
  /** Called when pointer enters/leaves an attack row (for board range preview). */
  onAttackHover: ((attack: AttackAbility | null) => void) | null = null;

  constructor(parent: HTMLElement, extraClass?: string) {
    this.container = el('div', extraClass ? `unit-card ${extraClass}` : 'unit-card');
    parent.appendChild(this.container);
  }

  private clearDockedImageLayout(): void {
    if (this.dockedImageLayoutCleanup) {
      this.dockedImageLayoutCleanup();
      this.dockedImageLayoutCleanup = null;
    }
    this.container.style.top = '';
    this.container.style.bottom = '';
  }

  /** Dock image-mode card between top safe margin and the dice UI (right column). */
  private attachDockedImageLayout(): void {
    this.clearDockedImageLayout();
    const gap = 12;
    const topMargin = 20;
    const update = (): void => {
      const dice = document.querySelector('.dice-container');
      if (!dice) return;
      const r = dice.getBoundingClientRect();
      const bottomPx = Math.max(0, window.innerHeight - (r.top - gap));
      this.container.style.top = `${topMargin}px`;
      this.container.style.bottom = `${bottomPx}px`;
    };
    update();
    const ro = new ResizeObserver(update);
    const dice = document.querySelector('.dice-container');
    if (dice) ro.observe(dice);
    window.addEventListener('resize', update);
    this.dockedImageLayoutCleanup = () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }

  private emitDice(pool: DicePool, source: UnitCardData): void {
    if (this.onDiceRequest) this.onDiceRequest({ pool, source });
  }

  private numericDicePool(r: HotspotRegion): DicePool {
    const pool: DicePool = {};
    if (r.red != null && r.red > 0) pool.red = r.red;
    if (r.black != null && r.black > 0) pool.black = r.black;
    if (r.green != null && r.green > 0) pool.green = r.green;
    if (r.white != null && r.white > 0) pool.white = r.white;
    return pool;
  }

  private resolveLegacyHotspotBinding(
    binding: LegacyHotspotBinding,
    source: UnitCardData,
  ): { pool: DicePool; attack: AttackAbility | null } | null {
    switch (binding.kind) {
      case 'attack': {
        const atk = source.attacks[binding.index];
        if (!atk) return null;
        return { pool: atk.dice, attack: atk };
      }
      case 'defense':
        return {
          pool: { white: source.defense.white, green: source.defense.green },
          attack: null,
        };
      case 'concentration':
        return { pool: source.concentration, attack: null };
      case 'defenseReaction':
        return {
          pool: { white: source.defenseReaction.white, green: source.defenseReaction.green },
          attack: null,
        };
      case 'exploration':
        return { pool: source.exploration ?? {}, attack: null };
      case 'custom':
        return { pool: binding.dice, attack: null };
      default:
        return null;
    }
  }

  /** Dice + optional synthetic attack for range highlight (numeric fields or legacy binding). */
  private hotspotAction(
    r: HotspotRegion,
    source: UnitCardData,
  ): { pool: DicePool; attackForHover: AttackAbility | null } | null {
    const numeric = this.numericDicePool(r);
    if (dicePoolTotal(numeric) > 0) {
      return {
        pool: numeric,
        attackForHover: this.syntheticHotspotAttack(r, numeric),
      };
    }
    if (r.range != null || r.damage != null) {
      return {
        pool: {},
        attackForHover: this.syntheticHotspotAttack(r, numeric),
      };
    }
    if (r.binding) {
      const leg = this.resolveLegacyHotspotBinding(r.binding, source);
      if (!leg) return null;
      return {
        pool: leg.pool,
        attackForHover: leg.attack,
      };
    }
    return null;
  }

  private syntheticHotspotAttack(r: HotspotRegion, pool: DicePool): AttackAbility {
    return {
      name: r.label,
      range: r.range ?? 1,
      attackRange: 'melee',
      damageType: 'physical',
      damage: r.damage ?? 0,
      dice: pool,
    };
  }

  private renderImageCard(data: UnitCardData, hf: HotspotFile, _anchorScreen?: { x: number; y: number }): void {
    const source = data;
    const wrap = el('div', 'uc-image-card');
    const inner = el('div', 'uc-image-card-inner');
    const img = document.createElement('img');
    img.className = 'uc-image-card-img';
    img.src = hf.image;
    img.alt = data.name;
    img.draggable = false;
    inner.appendChild(img);

    for (const r of hf.regions) {
      const btn = el('button', 'uc-image-hotspot');
      btn.type = 'button';
      btn.style.setProperty('--x', String(r.x));
      btn.style.setProperty('--y', String(r.y));
      btn.style.setProperty('--w', String(r.w));
      btn.style.setProperty('--h', String(r.h));
      btn.setAttribute('aria-label', r.label);
      btn.title = r.label;
      const action = this.hotspotAction(r, source);
      const hasDice = action && dicePoolTotal(action.pool) > 0;
      const hasHover = action?.attackForHover != null;
      if (hasDice) {
        btn.addEventListener('click', () => {
          if (action) this.emitDice(action.pool, source);
        });
      }
      if (hasHover) {
        btn.addEventListener('pointerenter', () => {
          if (this.onAttackHover && action?.attackForHover) this.onAttackHover(action.attackForHover);
        });
        btn.addEventListener('pointerleave', () => {
          if (this.onAttackHover) this.onAttackHover(null);
        });
      }
      if (!hasDice && !hasHover) {
        btn.classList.add('uc-image-hotspot--inactive');
      }
      inner.appendChild(btn);
    }

    wrap.appendChild(inner);
    this.container.appendChild(wrap);
  }

  show(
    data: UnitCardData,
    anchorScreen?: { x: number; y: number },
    options?: UnitCardShowOptions,
  ): void {
    const catalogUnitId = options?.catalogUnitId ?? data.catalogUnitId;
    const hf = catalogUnitId ? getHotspotsForUnit(catalogUnitId) : undefined;
    const willImageMode = !!(hf?.image && hf.regions.length > 0);
    const dockedKey = !anchorScreen
      ? `${willImageMode ? 'img' : 'stat'}-${catalogUnitId ?? 'noid'}-${data.name}-${data.size}`
      : null;

    if (!anchorScreen && this.visible && dockedKey && dockedKey === this.lastDockedShowKey) {
      if (willImageMode) {
        return;
      }
      this.patchDockedStatsHealth(data);
      return;
    }

    this.clearDockedImageLayout();
    this.visible = true;
    this.container.innerHTML = '';
    this.container.classList.add('unit-card-visible');
    this.container.classList.remove('unit-card-image-mode');

    if (anchorScreen) {
      this.container.classList.add('unit-card-floating');
      this.positionNearCursor(anchorScreen.x, anchorScreen.y);
    } else {
      this.container.classList.remove('unit-card-floating');
      this.clearFloatingPosition();
    }

    if (catalogUnitId) {
      const hf2 = getHotspotsForUnit(catalogUnitId);
      if (hf2?.image && hf2.regions.length > 0) {
        this.container.classList.add('unit-card-image-mode');
        this.renderImageCard(data, hf2, anchorScreen);
        if (!anchorScreen) {
          this.attachDockedImageLayout();
        }
        this.lastDockedShowKey = dockedKey;
        return;
      }
    }

    const source = data;

    // ── Header (optional flag + sprite + name + size badge) ──
    const header = el('div', 'uc-header');

    if (data.flagSprite) {
      const flagImg = el('img', 'uc-flag-thumb');
      flagImg.src = data.flagSprite;
      flagImg.alt = '';
      header.appendChild(flagImg);
    }

    if (data.sprite) {
      const portrait = el('div', 'uc-portrait');
      const img = el('img', 'uc-portrait-img');
      img.src = data.sprite;
      img.alt = data.name;
      portrait.appendChild(img);
      header.appendChild(portrait);
    }

    const headerInfo = el('div', 'uc-header-info');
    const name = el('div', 'uc-name', data.name);
    headerInfo.appendChild(name);

    const badges = el('div', 'uc-badges');
    const sizeLabel = data.size === 'big' ? 'Large' : data.size === 'large' ? 'Heavy' : data.size === 'huge' ? 'Colossal' : 'Infantry';
    const sizeBadge = el('span', `uc-badge uc-badge-${data.size}`, sizeLabel);
    badges.appendChild(sizeBadge);
    headerInfo.appendChild(badges);
    header.appendChild(headerInfo);
    this.container.appendChild(header);

    // ── Domains ──
    if (data.domains.length > 0) {
      const domainRow = el('div', 'uc-domain-row');
      for (const d of data.domains) {
        const badge = el('span', 'uc-domain-badge', DOMAIN_LABELS[d]);
        badge.style.background = DOMAIN_COLORS[d] + '30';
        badge.style.color = DOMAIN_COLORS[d];
        badge.style.borderColor = DOMAIN_COLORS[d] + '50';
        domainRow.appendChild(badge);
      }
      this.container.appendChild(domainRow);
    }

    if (data.faithMarkers && etherCrystalTotal(data.faithMarkers) > 0) {
      const faithRow = el('div', 'uc-faith-row');
      faithRow.appendChild(document.createTextNode('Приверженность: '));
      renderEtherCrystalPool(data.faithMarkers, faithRow);
      this.container.appendChild(faithRow);
    }

    // ── Health bar ──
    const healthSection = el('div', 'uc-health-section');
    const healthLabel = el('div', 'uc-health-label');
    const heartIcon = el('span', 'uc-heart', '\u2764');
    healthLabel.appendChild(heartIcon);
    healthLabel.appendChild(document.createTextNode(` ${data.health} / ${data.maxHealth}`));
    healthSection.appendChild(healthLabel);

    const healthBarOuter = el('div', 'uc-health-bar-outer');
    const healthBarInner = el('div', 'uc-health-bar-inner');
    const pct = Math.max(0, Math.min(100, (data.health / data.maxHealth) * 100));
    healthBarInner.style.width = `${pct}%`;
    if (pct > 50) healthBarInner.classList.add('uc-health-high');
    else if (pct > 25) healthBarInner.classList.add('uc-health-mid');
    else healthBarInner.classList.add('uc-health-low');
    healthBarOuter.appendChild(healthBarInner);
    healthSection.appendChild(healthBarOuter);
    this.container.appendChild(healthSection);

    // ── Core stats grid ──
    const moveUnit = movementDistanceUnit(data);
    const statsGrid = el('div', 'uc-stats-grid');

    // Defense (clickable)
    const defStat = el('div', 'uc-stat uc-stat-clickable');
    defStat.title = 'Click to add defense dice';
    defStat.addEventListener('click', () => this.emitDice({ white: data.defense.white, green: data.defense.green }, source));
    defStat.appendChild(el('span', 'uc-stat-icon', '\uD83D\uDEE1'));
    const defInfo = el('div', 'uc-stat-info');
    defInfo.appendChild(el('span', 'uc-stat-label', 'Defense'));
    const defValue = el('span', 'uc-stat-value uc-dice-inline');
    renderDefenseDice(data.defense, defValue);
    defInfo.appendChild(defValue);
    defStat.appendChild(defInfo);
    statsGrid.appendChild(defStat);

    // Walk
    const walkStat = el('div', 'uc-stat');
    walkStat.appendChild(el('span', 'uc-stat-icon', '\uD83D\uDEB6'));
    const walkInfo = el('div', 'uc-stat-info');
    walkInfo.appendChild(el('span', 'uc-stat-label', 'Walk'));
    const walkVal = el('span', 'uc-stat-value');
    appendDistanceBadge(walkVal, data.walk, moveUnit);
    walkInfo.appendChild(walkVal);
    walkStat.appendChild(walkInfo);
    statsGrid.appendChild(walkStat);

    // Run
    const runStat = el('div', 'uc-stat');
    runStat.appendChild(el('span', 'uc-stat-icon', '\uD83C\uDFC3'));
    const runInfo = el('div', 'uc-stat-info');
    runInfo.appendChild(el('span', 'uc-stat-label', 'Run'));
    const runVal = el('span', 'uc-stat-value');
    appendDistanceBadge(runVal, data.run, moveUnit);
    runInfo.appendChild(runVal);
    runStat.appendChild(runInfo);
    statsGrid.appendChild(runStat);

    // Concentration (clickable)
    const concStat = el('div', 'uc-stat uc-stat-clickable');
    concStat.title = 'Click to add concentration dice';
    concStat.addEventListener('click', () => this.emitDice(data.concentration, source));
    concStat.appendChild(el('span', 'uc-stat-icon', '\uD83C\uDFAF'));
    const concInfo = el('div', 'uc-stat-info');
    concInfo.appendChild(el('span', 'uc-stat-label', 'Concentration'));
    const concValue = el('span', 'uc-stat-value uc-dice-inline');
    renderDicePool(data.concentration, concValue);
    concInfo.appendChild(concValue);
    appendOptionalEtherCostRow(concInfo, data.concentrationEtherCost);
    concStat.appendChild(concInfo);
    statsGrid.appendChild(concStat);

    // Defense Reaction (clickable)
    const reactStat = el('div', 'uc-stat uc-stat-clickable');
    reactStat.title = 'Click to add defense reaction dice';
    reactStat.addEventListener('click', () => this.emitDice({ white: data.defenseReaction.white, green: data.defenseReaction.green }, source));
    reactStat.appendChild(el('span', 'uc-stat-icon', '\u21BA'));
    const reactInfo = el('div', 'uc-stat-info');
    reactInfo.appendChild(el('span', 'uc-stat-label', 'Def. Reaction'));
    const reactValue = el('span', 'uc-stat-value uc-dice-inline');
    renderDefenseDice(data.defenseReaction, reactValue);
    reactInfo.appendChild(reactValue);
    appendOptionalEtherCostRow(reactInfo, data.defenseReactionEtherCost);
    reactStat.appendChild(reactInfo);
    statsGrid.appendChild(reactStat);

    // Exploration (clickable when pool has dice)
    const explorationPool = data.exploration ?? {};
    const explorationTotal = dicePoolTotal(explorationPool);
    const exploreStat = el('div', 'uc-stat');
    if (explorationTotal > 0) {
      exploreStat.classList.add('uc-stat-clickable');
      exploreStat.title = 'Click to add exploration dice';
      exploreStat.addEventListener('click', () => this.emitDice(explorationPool, source));
    }
    exploreStat.appendChild(el('span', 'uc-stat-icon', '\uD83D\uDD0D'));
    const exploreInfo = el('div', 'uc-stat-info');
    exploreInfo.appendChild(el('span', 'uc-stat-label', 'Исследование'));
    const exploreValue = el('span', 'uc-stat-value uc-dice-inline');
    if (explorationTotal > 0) renderDicePool(explorationPool, exploreValue);
    else exploreValue.appendChild(document.createTextNode('—'));
    exploreInfo.appendChild(exploreValue);
    if (data.explorationRange != null && data.explorationRange >= 0) {
      const exploreRange = el('span', 'uc-stat-value uc-stat-explore-range');
      exploreRange.appendChild(document.createTextNode(' · '));
      appendDistanceBadge(exploreRange, data.explorationRange, moveUnit);
      exploreInfo.appendChild(exploreRange);
    }
    appendOptionalEtherCostRow(exploreInfo, data.explorationEtherCost);
    exploreStat.appendChild(exploreInfo);
    statsGrid.appendChild(exploreStat);

    // Take (grab range)
    const takeStat = el('div', 'uc-stat');
    takeStat.appendChild(el('span', 'uc-stat-icon', '\u270B'));
    const takeInfo = el('div', 'uc-stat-info');
    takeInfo.appendChild(el('span', 'uc-stat-label', 'Взять'));
    const takeVal = el('span', 'uc-stat-value');
    if (data.grabRange != null && data.grabRange >= 0) {
      appendDistanceBadge(takeVal, data.grabRange, moveUnit);
    } else {
      takeVal.appendChild(document.createTextNode('—'));
    }
    takeInfo.appendChild(takeVal);
    appendOptionalEtherCostRow(takeInfo, data.grabEtherCost);
    takeStat.appendChild(takeInfo);
    statsGrid.appendChild(takeStat);

    this.container.appendChild(statsGrid);

    // ── Attacks ──
    if (data.attacks.length > 0) {
      const attacksSection = el('div', 'uc-attacks');
      attacksSection.appendChild(el('div', 'uc-section-title', 'Attacks'));

      for (const atk of data.attacks) {
        const atkEl = el('div', 'uc-attack uc-attack-clickable');
        atkEl.title = `Click to add ${atk.name} dice`;
        atkEl.addEventListener('click', () => this.emitDice(atk.dice, source));
        atkEl.addEventListener('pointerenter', () => {
          if (this.onAttackHover) this.onAttackHover(atk);
        });
        atkEl.addEventListener('pointerleave', () => {
          if (this.onAttackHover) this.onAttackHover(null);
        });

        // Attack header row: name + type badge
        const atkHeader = el('div', 'uc-attack-header');
        atkHeader.appendChild(el('span', 'uc-attack-name', atk.name));
        const typeBadge = el('span',
          `uc-attack-type uc-attack-type-${atk.attackRange}`,
          atk.attackRange === 'melee' ? 'Melee' : 'Ranged');
        atkHeader.appendChild(typeBadge);
        if (atk.ethereal) {
          atkHeader.appendChild(el('span', 'uc-attack-tag', 'Эфир'));
        }
        if (atk.areaAttack) {
          atkHeader.appendChild(el('span', 'uc-attack-tag', 'Площадь'));
        }
        atkEl.appendChild(atkHeader);

        // Attack stats row
        const atkStats = el('div', 'uc-attack-stats');

        // Damage
        const dmgEl = el('span', 'uc-attack-stat');
        const dmgIcon = DAMAGE_TYPE_ICONS[atk.damageType];
        dmgEl.appendChild(el('span', 'uc-attack-stat-icon', dmgIcon));
        dmgEl.appendChild(document.createTextNode(`${atk.damage}`));
        const dmgLabel = el('span', 'uc-attack-stat-sublabel',
          DAMAGE_TYPE_LABELS[atk.damageType]);
        dmgEl.appendChild(dmgLabel);
        atkStats.appendChild(dmgEl);

        // Range (hex / hexon icon with value inside)
        const rangeEl = el('span', 'uc-attack-stat uc-attack-stat-range');
        appendDistanceBadge(rangeEl, atk.range, attackRangeDistanceUnit(data, atk));
        atkStats.appendChild(rangeEl);

        // Dice
        const diceEl = el('span', 'uc-attack-stat uc-dice-inline');
        renderDicePool(atk.dice, diceEl);
        atkStats.appendChild(diceEl);

        atkEl.appendChild(atkStats);

        if (atk.etherCost && etherCrystalTotal(atk.etherCost) > 0) {
          const etherRow = el('div', 'uc-attack-ether');
          etherRow.appendChild(document.createTextNode('Эфир: '));
          renderEtherCrystalPool(atk.etherCost, etherRow);
          atkEl.appendChild(etherRow);
        }

        // Modifiers
        if (atk.modifiers && atk.modifiers.length > 0) {
          const modsEl = el('div', 'uc-attack-mods');
          for (const mod of atk.modifiers) {
            const modEl = el('span',
              `uc-attack-mod uc-attack-mod-${mod.kind}`,
              mod.kind === 'icon' ? `\u2733 ${mod.label}` : mod.label);
            if (mod.description) modEl.title = mod.description;
            modsEl.appendChild(modEl);
          }
          atkEl.appendChild(modsEl);
        }

        attacksSection.appendChild(atkEl);
      }
      this.container.appendChild(attacksSection);
    }

    // ── Traits ──
    if (data.traits && data.traits.length > 0) {
      const traitsSection = el('div', 'uc-traits');
      traitsSection.appendChild(el('div', 'uc-section-title', 'Traits'));

      for (const trait of data.traits) {
        const traitEl = el('div', 'uc-trait');
        traitEl.appendChild(el('span', 'uc-trait-name', trait.name));
        traitEl.appendChild(el('span', 'uc-trait-desc', trait.description));
        traitsSection.appendChild(traitEl);
      }
      this.container.appendChild(traitsSection);
    }

    // ── Keywords ──
    if (data.keywords && data.keywords.length > 0) {
      const kwSection = el('div', 'uc-keywords');
      for (const kw of data.keywords) {
        kwSection.appendChild(el('span', 'uc-keyword', kw));
      }
      this.container.appendChild(kwSection);
    }

    if (!anchorScreen && dockedKey) {
      this.lastDockedShowKey = dockedKey;
    }
  }

  private patchDockedStatsHealth(data: UnitCardData): void {
    const label = this.container.querySelector('.uc-health-label');
    if (label) {
      const heart = label.querySelector('.uc-heart');
      label.replaceChildren();
      if (heart) label.appendChild(heart);
      else label.appendChild(el('span', 'uc-heart', '\u2764'));
      label.appendChild(document.createTextNode(` ${data.health} / ${data.maxHealth}`));
    }
    const inner = this.container.querySelector('.uc-health-bar-inner') as HTMLElement | null;
    if (inner && data.maxHealth > 0) {
      const pct = Math.max(0, Math.min(100, (data.health / data.maxHealth) * 100));
      inner.style.width = `${pct}%`;
      inner.classList.remove('uc-health-high', 'uc-health-mid', 'uc-health-low');
      if (pct > 50) inner.classList.add('uc-health-high');
      else if (pct > 25) inner.classList.add('uc-health-mid');
      else inner.classList.add('uc-health-low');
    }
  }

  private clearFloatingPosition(): void {
    this.container.style.left = '';
    this.container.style.top = '';
    this.container.style.transform = '';
  }

  private positionNearCursor(screenX: number, screenY: number): void {
    const offset = 16;
    const cardW = 300;
    const estH = 520;
    const margin = 8;
    let left = screenX + offset;
    let top = screenY + offset;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - estH - margin));
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
    this.container.style.transform = 'none';
  }

  /** Make the card transparent & click-through (during unit drag). */
  setPassthrough(on: boolean): void {
    this.container.classList.toggle('unit-card-passthrough', on);
  }

  repositionFloating(screenX: number, screenY: number): void {
    if (!this.visible || !this.container.classList.contains('unit-card-floating')) return;
    this.positionNearCursor(screenX, screenY);
  }

  hide(): void {
    if (!this.visible) return;
    if (this.onAttackHover) this.onAttackHover(null);
    this.clearDockedImageLayout();
    this.lastDockedShowKey = null;
    this.visible = false;
    const wasFloating = this.container.classList.contains('unit-card-floating');
    if (wasFloating) {
      this.container.style.transition = 'none';
    }
    this.container.classList.remove('unit-card-visible');
    this.container.classList.remove('unit-card-floating');
    this.clearFloatingPosition();
    if (wasFloating) {
      void this.container.offsetHeight;
      requestAnimationFrame(() => {
        this.container.style.transition = '';
      });
    }
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Used to ignore "click away" handling when the pointer is on the card. */
  containsEventTarget(t: EventTarget | null): boolean {
    return t instanceof Node && this.container.contains(t);
  }
}
