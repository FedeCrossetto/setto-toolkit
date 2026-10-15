# Sistema de diseño (v4 — SaaS moderno)

Referencia: editores SaaS modernos (Webflow / Linear / Raycast). Barra superior
oscura, barra lateral blanca, lienzo gris claro con paneles y tarjetas blancas,
inputs rellenos en gris sin borde, selección en lila suave, un acento violeta
eléctrico usado con moderación. El degradé del logo (cian → azul → magenta) es
sólo de marca: logo, splash, detalles puntuales. Íconos: Phosphor (estilo
SF Symbols) vía `src/core/icons/lucide-shim.tsx` — se importan como `lucide-react`.

## Dónde se cambia cada cosa

| Qué | Dónde |
|---|---|
| Colores de acento (paletas) | `src/core/hooks/useThemePalette.ts` (`LIGHT_TOKENS` / `DARK_TOKENS`, default `setto`). 12 paletas, una por matiz; estado único (`setPalette`), el swatch de Ajustes se pinta con los mismos tokens |
| Colores de datos (gráficos, categorías, avatares) | `--c-chart-1…8` / `chart-N` en Tailwind, generados por `chartColors()` desde el primary (rotación por ángulo áureo, contraste ≥ 3:1) |
| Temas completos (Nord, Catppuccin, Tokyo Night, GitHub, Dracula) | `src/core/themes/presets.ts`: acento + superficies por variante y la pareja de Editor/Terminal |
| Grises de superficie, texto, separadores (tema Setto) | `settoSurfaces()` / `tintSurfaces()` en `useThemePalette.ts`; estado único `useAppearance()` / `setAppearance()` (tema, paleta, fondos, estilo de oscuro) |
| Radios, bordes, sombras, blur | `src/styles/globals.css`, bloque **Forma** (`--radius-*`, `--hairline`, `--shadow-*`) |
| Color de ícono por módulo | `src/core/pluginIcons.tsx` — unificado: todos usan el acento; tiles con `pluginTile()` (degradé) |
| Escala tipográfica | clases `.t-*` en `globals.css` |
| Logo / ícono | master `public/logo-app-v5.png` → `npm run icons:build`; `public/setto-logo.png` (barra), `public/setto-logo-lg.png` (splash en `index.html`) |
| Íconos de la UI | `src/core/icons/lucide-shim.tsx` (mapa nombre → Phosphor, `DEFAULT_WEIGHT`) |
| Barra superior | `--c-topbar` en `useThemePalette.ts`, `.topbar` en `globals.css`, `TabBar.tsx` |

Tailwind mapea `rounded-*` y `shadow-*` a esas variables: no hay que tocar componentes para cambiar la forma.

## Reglas

- **Colores**: sólo tokens (`bg-surface`, `text-on-surface`, `text-on-surface-variant`, `bg-primary`,
  `text-success|warning|error`, `bg-on-surface/[0.06]` para rellenos neutros). Prohibido hex/rgb sueltos y
  clases de paleta cruda de Tailwind (`emerald-400`, `amber-500`, `violet-…`). Excepción: datos de gráficos
  (usar `rgb(var(--c-…))`).
- **Un solo acento**: violeta eléctrico `--c-primary` (paleta `setto`). Botón principal sólido `ui-btn-primary`, CTA oscuro `ui-btn-dark`, selección `bg-selected` (lila suave) con texto `text-on-surface` e ícono `text-primary` peso `fill`. Degradé de marca (`--gradient-brand`, `bg-brand`, `text-brand`) sólo para marca/destacados puntuales. Nada de colores distintos por módulo; naranja/rojo/verde sólo para estados. Cuando hay que distinguir varias series o ítems (gráficos, categorías, iniciales), usar `chart-N`, nunca primary/secondary/accent con distinta opacidad.
- **Superficies**: lienzo `bg-background` (gris), paneles/tarjetas `bg-surface` (blanco) con `hairline` y `shadow-sm`; paneles laterales internos `bg-surface` con `hairline-r`. Inputs `ui-input` (relleno gris, sin borde). Radios generosos (`rounded-lg` 10px controles, `rounded-xl` 14px tarjetas).
- **Una sola fuente:** Inter Variable incluida en la app (`@fontsource-variable/inter`, con tamaños ópticos: los títulos grandes usan el corte Display). Rasgos `cv11` + `ss01`; títulos en semibold (600–680) con tracking negativo. Mono sólo para código.
- **Sin** degradados decorativos fuera del acento de marca, brillos/glow, neón, texturas, mascotas ni animaciones de borde.
  Botones primarios y selección usan el degradé (`ui-btn-primary`, `bg-brand`); texto e íconos de acento usan `text-primary`.
- **Bordes**: `hairline` / `hairline-b|t|l|r` o `border-hairline`. Nada de `border-outline-variant/30`.
- **Tipografía**: `.t-title1|2|3`, `.t-headline`, `.t-body` (13px, por defecto), `.t-callout`, `.t-footnote`,
  `.t-caption`, `.t-section` (encabezado de grupo). Evitar `text-[11.5px]`, `uppercase tracking-widest`.
- **Componentes compartidos** (`src/core/components`):
  - `Modal`, `Sheet`, `ConfirmProvider/useConfirm` (`Modal.tsx`) — nunca `window.confirm`, nunca overlays a mano.
  - `Field`, `Toggle`, `SettingsGroup`, `SettingsRow`, `KpiCard`, `PageHeader` (`Form.tsx`).
  - `SegmentedControl`, `EmptyState`, `Badge`, `Tooltip`, `useToast`.
  - Clases: `ui-card`, `ui-card-interactive`, `ui-btn` + `ui-btn-primary|outline|ghost|danger` (+ `ui-btn-sm`,
    `ui-btn-icon`), `ui-input`, `ui-badge(-primary|success|warning|error)`, `ui-menu`, `ui-menu-item`,
    `mac-popover`, `mac-chrome`.
- **Layout de un módulo**: contenido con padding `px-6 py-5` (o `px-8 py-6` en páginas de lectura), ancho máximo
  razonable (`max-w-5xl mx-auto`) en páginas tipo formulario. Listas maestro-detalle: panel izquierdo
  `w-64 bg-sidebar/40 hairline-r` + detalle.
- **Idioma**: toda la UI en español rioplatense (vos), incluidos placeholders, tooltips y toasts.
- **Íconos**: lucide-react, 14–16px en controles, `strokeWidth` por defecto.

## Movimiento

- Presets únicos en `src/core/motion.ts` (framer-motion): `SPRING.snappy` para indicadores de selección que se deslizan (`layoutId`: TabBar, Sidebar, SegmentedControl), `listItemMotion()` para filas de listas (con `<AnimatePresence initial={false} mode="popLayout">`), `tableRowMotion()` para filas de tabla. No inventar curvas ni duraciones sueltas.
- Cortas (120–200 ms), sólo `transform`/`opacity`, nunca bloquean la interacción.
- Listas con más de `MAX_ANIMATED_ITEMS` ítems no se animan. Nada de animaciones en CodeMirror, xterm ni resultados de búsqueda largos.
- Contenedores con scroll que contienen layout animations llevan `layoutScroll` (`motion.div`/`motion.nav`).
- La pastilla deslizante va `z-0` y los textos/íconos del ítem `relative z-10`, si no la pastilla los tapa al pasar.
- Cambio de pestaña: keyframe CSS `tabIn` con fill-mode `backwards` (un `transform` residual rompe los `position: fixed` del módulo).
- "Reducir movimiento" del sistema: CSS en `globals.css` + `<MotionConfig reducedMotion="user">` en `App.tsx`.
- Superposiciones: `Modal`, `Sheet` y los toasts usan `backdropMotion` / `dialogMotion` / `sheetMotion` / `toastMotion` (entran y salen). Números de KPI: `<CountUp>`.

## Integración entre módulos

- `Ctrl+K` busca en todo: cada módulo aporta un `SearchProvider` (`src/core/search.ts`) desde
  `src/plugins/<id>/search.ts`, registrado en `src/core/search-registry.ts`.
- Abrir un módulo con un pedido concreto: `dispatch({ type: 'OPEN_WITH_INTENT', pluginId, action, payload })`;
  el módulo lo recibe con `usePluginIntent(pluginId, handler)` (`src/core/AppContext.tsx`).
