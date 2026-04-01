/**
 * Unit Card — displays unit stats, abilities, and info.
 * Appears on the right side of the screen above the dice roller
 * when a unit (small or big) is selected.
 */

// ── Types ──────────────────────────────────────────────────────

export type UnitSize = 'small' | 'big';

export interface UnitCardData {
  name: string;
  size: UnitSize;
  health: number;
  maxHealth: number;
  walk: number;
  run: number;
  /** Sprite/image URL (optional) */
  sprite?: string;
  /** Stat block */
  stats: {
    attack: number;
    defense: number;
    initiative: number;
  };
  /** Abilities list */
  abilities: {
    name: string;
    description: string;
    cost?: string; // e.g. "2 AP" or "Once per turn"
  }[];
  /** Optional keywords/tags */
  keywords?: string[];
}

// ── DOM helper ─────────────────────────────────────────────────

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

// ── UnitCard class ─────────────────────────────────────────────

export class UnitCard {
  private container: HTMLElement;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.container = el('div', 'unit-card');
    parent.appendChild(this.container);
  }

  /**
   * @param anchorScreen — if set, card follows cursor (Alt-hover); otherwise docked panel (selection).
   */
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
    const sizeBadge = el('span', `uc-badge uc-badge-${data.size}`,
      data.size === 'big' ? 'Large' : 'Infantry');
    badges.appendChild(sizeBadge);
    if (data.keywords) {
      for (const kw of data.keywords) {
        badges.appendChild(el('span', 'uc-badge uc-badge-keyword', kw));
      }
    }
    headerInfo.appendChild(badges);
    header.appendChild(headerInfo);
    this.container.appendChild(header);

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
    const statsGrid = el('div', 'uc-stats-grid');
    const movementLabel = data.size === 'big' ? 'hexons' : 'hexes';
    const statItems: { icon: string; label: string; value: string }[] = [
      { icon: '\u2694', label: 'Attack', value: String(data.stats.attack) },
      { icon: '\u{1F6E1}', label: 'Defense', value: String(data.stats.defense) },
      { icon: '\u26A1', label: 'Initiative', value: String(data.stats.initiative) },
      { icon: '\u{1F6B6}', label: 'Walk', value: `${data.walk} ${movementLabel}` },
      { icon: '\u{1F3C3}', label: 'Run', value: `${data.run} ${movementLabel}` },
    ];

    for (const item of statItems) {
      const statEl = el('div', 'uc-stat');
      const iconEl = el('span', 'uc-stat-icon', item.icon);
      const infoEl = el('div', 'uc-stat-info');
      const labelEl = el('span', 'uc-stat-label', item.label);
      const valueEl = el('span', 'uc-stat-value', item.value);
      infoEl.appendChild(labelEl);
      infoEl.appendChild(valueEl);
      statEl.appendChild(iconEl);
      statEl.appendChild(infoEl);
      statsGrid.appendChild(statEl);
    }
    this.container.appendChild(statsGrid);

    // ── Abilities ──
    if (data.abilities.length > 0) {
      const abilitiesSection = el('div', 'uc-abilities');
      const abilitiesTitle = el('div', 'uc-section-title', 'Abilities');
      abilitiesSection.appendChild(abilitiesTitle);

      for (const ability of data.abilities) {
        const abilityEl = el('div', 'uc-ability');
        const abilityHeader = el('div', 'uc-ability-header');
        const abilityName = el('span', 'uc-ability-name', ability.name);
        abilityHeader.appendChild(abilityName);
        if (ability.cost) {
          const costEl = el('span', 'uc-ability-cost', ability.cost);
          abilityHeader.appendChild(costEl);
        }
        abilityEl.appendChild(abilityHeader);
        const desc = el('div', 'uc-ability-desc', ability.description);
        abilityEl.appendChild(desc);
        abilitiesSection.appendChild(abilityEl);
      }
      this.container.appendChild(abilitiesSection);
    }
  }

  private clearFloatingPosition(): void {
    this.container.style.left = '';
    this.container.style.top = '';
    this.container.style.transform = '';
  }

  /** Keep card on-screen; offset from cursor (matches .unit-card width in CSS). */
  private positionNearCursor(screenX: number, screenY: number): void {
    const offset = 16;
    const cardW = 260;
    const estH = 420;
    const margin = 8;
    let left = screenX + offset;
    let top = screenY + offset;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - estH - margin));
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
    this.container.style.transform = 'none';
  }

  /** Update cursor offset without rebuilding DOM (Alt-hover while moving mouse). */
  repositionFloating(screenX: number, screenY: number): void {
    if (!this.visible || !this.container.classList.contains('unit-card-floating')) return;
    this.positionNearCursor(screenX, screenY);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    const wasFloating = this.container.classList.contains('unit-card-floating');
    // Avoid docked-layout + opacity transition when closing the cursor-following card.
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
}
