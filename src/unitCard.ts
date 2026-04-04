/**
 * Unit Card — displays unit stats, abilities, and info.
 * Appears on the right side of the screen above the dice roller
 * when a unit (small or big) is selected.
 */

// ── Types ──────────────────────────────────────────────────────

export type UnitSize = 'small' | 'big' | 'large' | 'huge';

export type DamageType = 'physical' | 'fire' | 'mental' | 'poison';
export type AttackRange = 'melee' | 'ranged';
export type Domain = 'order' | 'chaos' | 'nature' | 'shadow';

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
  /** Sprite/image URL (optional) */
  sprite?: string;
  /** Domain affinities (1..4) */
  domains: Domain[];
  /** Concentration: extra dice added when concentrating */
  concentration: DicePool;
  /** Defense reaction: extra dice added on reaction */
  defenseReaction: { white?: number; green?: number };
  /** Exploration: dice pool for exploration checks (optional). */
  exploration?: DicePool;
  /**
   * Max distance for “take / pick up” interactions.
   * Display uses hexes for small & large, hexons for big & huge (same as walk/run).
   */
  grabRange?: number;
  /** Attack abilities */
  attacks: AttackAbility[];
  /** Passive/special traits */
  traits?: UnitTrait[];
  /** Keywords/tags */
  keywords?: string[];
}

export interface DiceRequest {
  pool: DicePool;
  source: UnitCardData;
}

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

const DOMAIN_COLORS: Record<Domain, string> = {
  order: '#4a90d9',
  chaos: '#d94a4a',
  nature: '#4caf50',
  shadow: '#9c27b0',
};

const DOMAIN_LABELS: Record<Domain, string> = {
  order: 'Order',
  chaos: 'Chaos',
  nature: 'Nature',
  shadow: 'Shadow',
};

const DAMAGE_TYPE_ICONS: Record<DamageType, string> = {
  physical: '\u2694',
  fire: '\uD83D\uDD25',
  mental: '\uD83E\uDDE0',
  poison: '\u2620',
};

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  physical: 'Physical',
  fire: 'Fire',
  mental: 'Mental',
  poison: 'Poison',
};

const DICE_COLORS: Record<string, string> = {
  red: '#e53935',
  green: '#43a047',
  black: '#424242',
  white: '#e0e0e0',
};

function dicePoolTotal(pool: DicePool): number {
  return (pool.red ?? 0) + (pool.green ?? 0) + (pool.black ?? 0) + (pool.white ?? 0);
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

// ── UnitCard class ─────────────────────────────────────────────

export class UnitCard {
  private container: HTMLElement;
  private visible = false;
  /** Called when a dice-bearing element is clicked on the card. */
  onDiceRequest: ((req: DiceRequest) => void) | null = null;
  /** Called when pointer enters/leaves an attack row (for board range preview). */
  onAttackHover: ((attack: AttackAbility | null) => void) | null = null;

  constructor(parent: HTMLElement, extraClass?: string) {
    this.container = el('div', extraClass ? `unit-card ${extraClass}` : 'unit-card');
    parent.appendChild(this.container);
  }

  private emitDice(pool: DicePool, source: UnitCardData): void {
    if (this.onDiceRequest) this.onDiceRequest({ pool, source });
  }

  show(data: UnitCardData, anchorScreen?: { x: number; y: number }): void {
    this.visible = true;
    this.container.innerHTML = '';
    this.container.classList.add('unit-card-visible');

    if (anchorScreen) {
      this.container.classList.add('unit-card-floating');
      this.positionNearCursor(anchorScreen.x, anchorScreen.y);
    } else {
      this.container.classList.remove('unit-card-floating');
      this.clearFloatingPosition();
    }

    const source = data;

    // ── Header (sprite + name + size badge) ──
    const header = el('div', 'uc-header');

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
    const movementLabel = (data.size === 'big' || data.size === 'huge') ? 'hexons' : 'hexes';
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
    walkInfo.appendChild(el('span', 'uc-stat-value', `${data.walk} ${movementLabel}`));
    walkStat.appendChild(walkInfo);
    statsGrid.appendChild(walkStat);

    // Run
    const runStat = el('div', 'uc-stat');
    runStat.appendChild(el('span', 'uc-stat-icon', '\uD83C\uDFC3'));
    const runInfo = el('div', 'uc-stat-info');
    runInfo.appendChild(el('span', 'uc-stat-label', 'Run'));
    runInfo.appendChild(el('span', 'uc-stat-value', `${data.run} ${movementLabel}`));
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
    exploreStat.appendChild(exploreInfo);
    statsGrid.appendChild(exploreStat);

    // Take (grab range)
    const takeStat = el('div', 'uc-stat');
    takeStat.appendChild(el('span', 'uc-stat-icon', '\u270B'));
    const takeInfo = el('div', 'uc-stat-info');
    takeInfo.appendChild(el('span', 'uc-stat-label', 'Взять'));
    const takeVal =
      data.grabRange != null && data.grabRange >= 0
        ? `${data.grabRange} ${movementLabel}`
        : '—';
    takeInfo.appendChild(el('span', 'uc-stat-value', takeVal));
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

        // Range
        const rangeEl = el('span', 'uc-attack-stat');
        rangeEl.appendChild(el('span', 'uc-attack-stat-icon', '\uD83C\uDFAF'));
        rangeEl.appendChild(document.createTextNode(`${atk.range}`));
        atkStats.appendChild(rangeEl);

        // Dice
        const diceEl = el('span', 'uc-attack-stat uc-dice-inline');
        renderDicePool(atk.dice, diceEl);
        atkStats.appendChild(diceEl);

        atkEl.appendChild(atkStats);

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
