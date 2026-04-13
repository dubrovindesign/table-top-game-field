# Project Rules

## Canvas element scaling

**Все элементы, отображаемые на игровом канвасе, должны масштабироваться вместе с камерой.**

Зоны потерь, карточки, пиллы и любые другие DOM-элементы, позиционированные на поверхности канваса, обязаны реагировать на зум камеры.

### Как это устроено

Враппер зоны (`.dead-unit-table-wrap` и аналогичные) получает CSS-переменную `--dead-unit-zoom` через JS:

```ts
wrap.style.setProperty('--dead-unit-zoom', zoom.toFixed(4));
```

Значение `zoom` — текущий масштаб камеры (например, `1.0` при 100%, `2.0` при двойном приближении).

### Правило для CSS

Все размерные свойства canvas-элементов задаются через `calc(Xpx * var(--dead-unit-zoom))`:

```css
/* Правильно */
font-size: calc(13px * var(--dead-unit-zoom));
padding: calc(6px * var(--dead-unit-zoom)) calc(12px * var(--dead-unit-zoom));
border-radius: calc(8px * var(--dead-unit-zoom));
border-width: calc(1px * var(--dead-unit-zoom));
box-shadow: 0 calc(4px * var(--dead-unit-zoom)) calc(16px * var(--dead-unit-zoom)) rgba(0,0,0,0.35);
gap: calc(4px * var(--dead-unit-zoom));

/* Неправильно — фиксированный размер на канвасе */
font-size: 13px;
padding: 6px 12px;
```

Позиционирование (left/top/width/height) задаётся из JS в экранных пикселях через `applyBounds` — оно уже учитывает зум.

Отступы/сдвиги внутри canvas-элементов тоже масштабируются:

```css
transform: translateY(calc(-100% - 4px * var(--dead-unit-zoom)));
```

### Где НЕ нужен zoom

UI вне канваса (верхняя панель, боковые меню, кошельки, диалоги) работает в фиксированных пикселях — там `--dead-unit-zoom` не используется.
