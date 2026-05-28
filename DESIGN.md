# DESIGN.md — CAR · Garantia CFMOTO da Amazônia

> Design system completo da aplicação de gestão de garantias de peças automotivas.
> Tema: **Dark Industrial** · Abordagem: **Mobile-First PWA**

---

## 1. Identidade Visual

| Atributo | Valor |
|---|---|
| Produto | CAR · Garantia |
| Empresa | CFMOTO da Amazônia |
| Tom | Industrial, denso, confiante |
| Plataforma | PWA (Progressive Web App) |
| Idioma | Português (pt-BR) |
| Tema de cor | Dark (fundo quase preto, acentos laranja) |

---

## 2. Paleta de Cores

### Marca — Laranja (referenciado como `--blue-*` no código por razões históricas)

| Token | Hex | Uso |
|---|---|---|
| `--blue-600` | `#CC4400` | Pressed / dark variant |
| `--blue-500` | `#FF6600` | **Cor principal** — CTAs, nav activo, badges, stepper |
| `--blue-400` | `#FF8533` | Hover states, texto activo |
| `--blue-300` | `#FFAA66` | Texto em fundos escuros, chips activos |
| `--blue-100` | `#2A1500` | Background de elementos laranja (info banners) |
| `--blue-50`  | `#1A0D00` | Background muito subtil laranja |

### Âmbar — Avisos / Pintura

| Token | Hex | Uso |
|---|---|---|
| `--amber-500` | `#F59E0B` | Avisos, status "pendente", pintura |
| `--amber-400` | `#FBBF24` | Hover âmbar |
| `--amber-100` | `#292206` | Background de avisos |

### Verde — Sucesso / Concluído

| Token | Hex | Uso |
|---|---|---|
| `--green-500` | `#22C55E` | Status "done", stock OK |
| `--green-400` | `#4ADE80` | Texto em botões de sucesso |
| `--green-100` | `#052E16` | Background de sucesso |

### Vermelho — Erros / Perigo

| Token | Hex | Uso |
|---|---|---|
| `--red-500` | `#EF4444` | Erros, stock zero |
| `--red-100` | `#300A0A` | Background de erro |

### Púrpura — Pintoria (workflow exclusivo)

| Valor | Uso |
|---|---|
| `#8B5CF6` | Badge "Na Pintoria", botão scan QR pintura |
| `#7C3AED` | Gradiente do botão scan |
| `rgba(139,92,246,0.15)` | Background do badge pintoria |

### Azul — Enviado

| Valor | Uso |
|---|---|
| `#60A5FA` | Badge status "sent" |
| `#3B82F6` | Border-left de cards "sent" |

### Ciano — ETA Confirmado

| Valor | Uso |
|---|---|
| `#22D3EE` | ETA display, status ETA |
| `#06B6D4` | Border-left, badge ETA |

### Fundos (Background Layers)

| Token | Hex | Uso |
|---|---|---|
| `--bg-base`  | `#0C0C0C` | Fundo raiz — página, header, bottom nav |
| `--bg-deep`  | `#111111` | Cards de detalhe, modais, painéis |
| `--bg-card`  | `#1A1A1A` | Cards de lista, form cards |
| `--bg-input` | `#1F1F1F` | Campos de input, áreas de texto |
| `--bg-hover` | `#252525` | Hover de cards e botões |

### Tinta / Texto (Ink — escala de opacidade branca)

| Token | Valor | Uso |
|---|---|---|
| `--ink-0`   | `#FFFFFF` | Branco puro (raramente usado directo) |
| `--ink-100` | `rgba(255,255,255,0.90)` | Texto principal |
| `--ink-200` | `rgba(255,255,255,0.65)` | Texto secundário |
| `--ink-300` | `rgba(255,255,255,0.40)` | Labels, metadados |
| `--ink-400` | `rgba(255,255,255,0.25)` | Placeholders, texto desactivado |
| `--ink-500` | `rgba(255,255,255,0.12)` | Ícones subtis |
| `--ink-600` | `rgba(255,255,255,0.07)` | Separadores |
| `--ink-700` | `rgba(255,255,255,0.04)` | Fundos de contraste mínimo |

### Bordas

| Token | Valor | Uso |
|---|---|---|
| `--border`    | `rgba(255,255,255,0.08)` | Bordas padrão |
| `--border-md` | `rgba(255,255,255,0.14)` | Bordas em foco ou destaque |

---

## 3. Tipografia

### Famílias

| Token | Fonte | Fallback | Uso |
|---|---|---|---|
| `--font-sans` | **DM Sans** | `-apple-system, sans-serif` | Todo o texto UI — labels, botões, títulos |
| `--font-mono` | **DM Mono** | `monospace` | Códigos de peças, números de série, datas |

### Pesos usados

| Peso | Classe DM Sans | Uso |
|---|---|---|
| 400 | Regular | Texto de corpo, descrições |
| 500 | Medium | Labels de campo |
| 600 | SemiBold | Nomes, títulos secundários |
| 700 | Bold | Títulos, botões, badges |
| 800 | ExtraBold | Números grandes (KPI, quantities) |

### Escala de tamanhos

| Tamanho | Contexto |
|---|---|
| `9px` | Rótulos de nav, labels de campo (uppercase) |
| `9.5px` | Labels do status stepper |
| `10px` | Badges, metadados, timestamps |
| `11px` | Texto auxiliar, sub-labels |
| `12px` | Corpo secundário, histórico, erros inline |
| `13px` | Corpo principal, botões, chips, nomes de card |
| `14px` | Inputs, campos de formulário |
| `15px` | Botões grandes, títulos de modal |
| `16px` | Títulos de modal, headers de card |
| `18px` | Título no detail header |
| `22px` | Valores de stock summary |
| `26px` | Valores do relatório pintoria |
| `30px` | Dashboard tempo médio |
| `2rem` | Stat cards (valor KPI) |
| `44px` | Quantidade em Stock detail modal |

---

## 4. Espaçamento & Raios

### Border Radius

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm`   | `8px`   | Badges, elementos pequenos |
| `--radius-md`   | `12px`  | Cards secundários, inputs, chips |
| `--radius-lg`   | `16px`  | Cards principais, modais, form cards |
| `--radius-xl`   | `24px`  | Auth card, modal bottom sheet |
| `--radius-full` | `999px` | Chips, badges, pílulas, nav QR |

### Dimensões fixas

| Token | Valor | Uso |
|---|---|---|
| `--header-h` | `56px` | Altura do header fixo |
| `--bottom-h` | `64px` | Altura do bottom nav mobile |

### Espaçamento interno de componentes

| Componente | Padding |
|---|---|
| `.btn` padrão | `11px 18px` |
| `.btn-lg` | `14px 22px` |
| `.btn-sm` | `7px 12px` |
| `.chip` | `6px 14px` |
| `.form-card` | `20px` |
| `.detail-header` | `16px` |
| `.stat-card` | `18px 10px 14px` |
| `.modal` | `20px 20px 28px + safe-area` |
| `.incident-info` | `11px 13px 10px` |

---

## 5. Sombras

| Token | Valor | Uso |
|---|---|---|
| `--shadow-sm`   | `0 2px 8px rgba(0,0,0,0.4)`  | Cards simples, chips activos |
| `--shadow-md`   | `0 4px 20px rgba(0,0,0,0.5)` | Modais, toasts |
| `--shadow-lg`   | `0 8px 40px rgba(0,0,0,0.6)` | Auth card, overlays |
| `--shadow-blue` | `0 4px 20px rgba(255,102,0,0.35)` | Nav QR button, botão primário |

### Sombras especiais

| Contexto | Valor |
|---|---|
| Detail header glow lateral | `-3px 0 20px rgba(255,102,0,0.10)` |
| Desktop card hover | `0 4px 22px rgba(0,0,0,0.45)` |
| Nav QR pulse max | `0 6px 24px rgba(255,102,0,0.70)` |
| `.btn-primary` hover | `0 4px 22px rgba(255,102,0,0.52)` |

---

## 6. Layout

### Breakpoints

| Classe | Condição | Activação |
|---|---|---|
| `html.is-mobile`  | `window.innerWidth < 900`  | JS antes do primeiro paint |
| `html.is-desktop` | `window.innerWidth >= 900` | JS antes do primeiro paint |

> Não usa `@media` — toda a diferenciação desktop é via `html.is-desktop` no `css/desktop.css`.

### Mobile Layout

```
┌─────────────────────────┐  ← .app-header (56px, sticky, glassmorphism)
│  Logo  │  Nav Tabs  │ 👤 │
├─────────────────────────┤
│                         │
│   .page.active          │  ← scroll vertical livre
│   .main (max 600px)     │
│                         │
├─────────────────────────┤
│  🔍  📋  [QR]  📦  📊  │  ← .bottom-nav (64px, fixed, glassmorphism)
└─────────────────────────┘
```

### Desktop Layout (≥ 900px)

```
┌─────────────────────────────────────────┐  ← header com nav tabs horizontais
│  Logo  │ Incidentes · Stock · Relatório │  user chip
├──────────────┬──────────────────────────┤
│ .list-panel  │  .desktop-detail-panel   │  ← grid 32vw / 1fr
│              │                          │
│  Stats       │  (vazio ou detalhe)      │
│  Search      │                          │
│  Filter      │                          │
│  ─────────   │                          │
│  Cards       │                          │
│  (scroll)    │                          │
└──────────────┴──────────────────────────┘
```

---

## 7. Componentes

### 7.1 Botões

| Classe | Aparência | Uso |
|---|---|---|
| `.btn` | `bg-card`, borda, texto `ink-200` | Botão secundário padrão |
| `.btn-primary` | Gradiente laranja, branco, glow | Acção principal |
| `.btn-success` | Verde subtil | Confirmar / concluir |
| `.btn-danger` | Vermelho subtil | Eliminar / cancelar destrutivo |
| `.btn-lg` | Maior (50px min-height) | CTAs de destaque |
| `.btn-sm` | Menor (34px min-height) | Acções inline |
| `.btn-full` | `width: 100%` | Acção de largura total |
| `.btn-paint-scan` | Gradiente púrpura | Scan QR pintura |
| `.btn-admin-override` | Âmbar subtil, pequeno | Bypass admin sem QR |
| `.btn-paint-label` | Âmbar subtil | Gerar etiqueta de pintura |
| `.btn-tracking` | Laranja subtil | Link de rastreio |

**Estados:**
- `:hover` — fundo levemente mais claro + `box-shadow`
- `:active` — `transform: scale(0.97)`
- `:disabled` — `opacity: 0.4`, sem cursor

---

### 7.2 Badges de Status

| Classe | Cor | Status |
|---|---|---|
| `.badge-pending`     | Âmbar `#F59E0B`  | Pendente |
| `.badge-sent`        | Azul `#60A5FA`   | Enviado à fábrica |
| `.badge-awaiting`    | Púrpura `#A78BFA`| Aguardando resposta |
| `.badge-eta`         | Ciano `#22D3EE`  | ETA confirmado |
| `.badge-received`    | Lima `#A3E635`   | Peça recebida |
| `.badge-done`        | Verde `#22C55E`  | Encerrado |
| `.badge-paint-sent`  | Púrpura `#8B5CF6`| Na Pintoria |
| `.badge-blue`        | Laranja subtil   | Genérico / informativo |

**Anatomia:** `inline-flex · gap 3px · padding 3px 9px · border-radius full · font 10px bold · letter-spacing 0.04em`

---

### 7.3 Cards de Incidente

```
┌──────┬──────────────────────────────────┐
│ 72px │  .incident-name (13px bold)      │
│ foto │  .incident-code (10px mono)      │
│      │  ──────────────────────────────  │
│      │  [badge]           [meta text]   │
└──────┴──────────────────────────────────┘
```

- Border-left de `3px` colorida pelo status (laranja, âmbar, verde, azul, etc.)
- Animação `fadeInUp` com stagger por posição (35ms incremental)
- Desktop: hover eleva `translateY(-2px)` + sombra

---

### 7.4 Status Stepper

Barra horizontal com dots circulares conectados por linhas:

```
● ──── ● ──── ○ ──── ○
past   past  current  future
```

| Estado | Dot | Label |
|---|---|---|
| `step-past`    | Fundo laranja sólido, ✓ | `rgba(255,255,255,0.65)` |
| `step-current` | Fundo laranja + pulse animation | `rgba(255,255,255,0.65)` |
| future         | Fundo muito subtil | `rgba(255,255,255,0.22)` |

**Animação pulse:** `0→4px→8px box-shadow` em loop de 2.2s ease-in-out

---

### 7.5 History Timeline

Lista vertical de eventos com linha de ligação:

```
● ─── Status Label          timestamp
│     user@email
│     ┌─────────────────┐
│     │ nota do evento  │
│     └─────────────────┘
● ─── Status Label          timestamp
      ...
```

- Dot colorido pelo status do evento
- Linha vertical `::after` de 2px, gradiente opacidade 9%→2%
- Último entry não tem linha

---

### 7.6 Chips de Filtro

```
[ Todos ]  [ Pendente ]  [ Enviado ]  [ Concluído ]
```

- Inactivo: `border 1.5px ink-200, bg-deep, ink-300`
- Activo: `rgba(255,102,0,0.16)`, texto `--blue-300`, borda `rgba(255,102,0,0.48)`
- Hover (inactivo): `ink-200`, borda mais visível

---

### 7.7 Form Cards

Agrupam campos relacionados:
- Fundo: gradiente `#1A1A1A → #151515`
- Borda: `1px solid --border`
- Highlight inset 1px no topo
- Título uppercase laranja + linha separadora

---

### 7.8 Stats Row / KPI Cards

Grid 3 colunas mobile (`repeat(3, 1fr)`) ou 5 colunas desktop:
- Fundo `--bg-deep`, borda `--border-md`
- Valor: `2rem` weight 800, colorido por métrica
- Label: `10px` uppercase `--ink-300`
- Inset top highlight 1px

---

### 7.9 Modal (Bottom Sheet)

- Abre do fundo com animação `slideUp 0.22s`
- `border-radius: 24px 24px 0 0`
- Handle de 36×4px no topo
- Backdrop com `blur(4px)` e `rgba(0,0,0,0.6)`
- `padding-bottom: safe-area-inset-bottom` para iPhone

---

### 7.10 Toast

- Posição: `fixed bottom calc(bottom-nav + 12px) centered`
- `border-radius: full`, `bg-card`, sombra média
- Animação: `translateY(12px) → 0` + `opacity 0 → 1`
- Duração padrão: 3-4 segundos
- Max-width: `calc(100vw - 32px)`

---

### 7.11 QR Scanner Overlay

- Fundo preto `#000`, `z-index: 400`
- Viewfinder: quadrado 200×200px com sombra que cobre o resto
- 4 cantos brancos de 28px com bordas de 3px
- Fecha automaticamente ao detectar QR válido

---

## 8. Sistema de Status — Peças Normais

```
pending → sent → awaiting → eta_confirmed → received → done
```

| Status | Label PT | Cor |
|---|---|---|
| `pending` | Pendente | Âmbar `#F59E0B` |
| `sent` | Enviado | Azul `#60A5FA` |
| `awaiting` | Aguardando | Púrpura `#A78BFA` |
| `eta_confirmed` | ETA Confirmado | Ciano `#22D3EE` |
| `received` | Peça Recebida | Lima `#A3E635` |
| `done` | Encerrado | Verde `#22C55E` |

---

## 9. Sistema de Status — Pintoria

```
pending → sent → done
```

| Status | Label PT | Cor | Acção |
|---|---|---|---|
| `pending` | Aguardando Envio | Âmbar | Scan QR → confirmar envio |
| `sent` | Na Pintoria | Púrpura `#8B5CF6` | Scan QR → confirmar retorno |
| `done` | Encerrado | Verde | — |

**Etiqueta de pintura:** formato 58×40mm, QR code de 34mm, impressão via `@media print`.

---

## 10. Animações

| Nome | Duração | Uso |
|---|---|---|
| `fadeInUp` | `0.2s ease` | Entrada de cards (com stagger) |
| `pageFadeIn` | `0.18s ease` | Transição entre páginas |
| `slideUp` | `0.22s ease` | Modal bottom sheet |
| `slideDown` | `0.25s ease` | Banner de pintura |
| `splashPulse` | `1.8s ease-in-out infinite` | Logo no splash screen |
| `spin` | `0.7–0.8s linear infinite` | Spinners de loading |
| `stepperPulse` | `2.2s ease-in-out infinite` | Dot do step actual |
| `navQrGlow` | `3s ease-in-out infinite` | Botão QR da bottom nav |
| `hintArrow` | `1.8s ease-in-out infinite` | Seta de hint (desktop vazio) |
| `scaleIn` | `0.2s ease` | Modal de confirmação pintura |
| `fadeIn` | `0.15s ease` | Overlay de confirmação |

---

## 11. Glassmorphism

Aplicado nos elementos fixos sobrepostos ao conteúdo:

| Elemento | Background | Blur |
|---|---|---|
| `.app-header` | `rgba(12,12,12,0.90)` | `blur(24px) saturate(180%)` |
| `.bottom-nav` | `rgba(12,12,12,0.90)` | `blur(20px) saturate(160%)` |
| `.modal-overlay` | `rgba(0,0,0,0.60)` | `blur(4px)` |

---

## 12. Desktop — Diferenciações

Todas as regras em `css/desktop.css`, activadas por `html.is-desktop`:

- **Header:** padding `0 28px`, nav tabs horizontais visíveis
- **Bottom nav:** escondido
- **Layout:** grid `32vw / 1fr` (lista + detalhe)
- **Lista:** `overflow: hidden + flex`, scroll apenas no body da lista
- **Incident cards:** hover com `translateY(-2px)` + sombra
- **Selected card:** border laranja + `box-shadow inset` com brilho laranja
- **Detail panel:** gradiente radial duplo com halo laranja
- **Scrollbar:** `4px`, thumb laranja `rgba(255,102,0,0.25)`
- **Back button:** oculto no painel de detalhe

---

## 13. Iconografia

- Ícones inline **SVG** directamente no HTML/JS
- Tamanho padrão: `22×22px` (nav), `14–16px` (inline), `26px` (foto buttons)
- Cor herdada via `currentColor`
- Nav activo: `drop-shadow(0 0 5px rgba(255,102,0,0.6))`

---

## 14. Acessibilidade

- `min-height: 44px` em todos os botões (guideline iOS)
- `-webkit-tap-highlight-color: transparent` globalmente
- `touch-action: manipulation` em botões e chips
- `overscroll-behavior: none` no body
- `user-scalable=no` no viewport (app industrial, não editorial)
- `safe-area-inset-bottom` no bottom nav e modais
- `prefers-color-scheme`: apenas dark suportado

---

## 15. PWA / Service Worker

| Atributo | Valor |
|---|---|
| `theme-color` | `#060E1A` |
| `display` | `standalone` |
| `orientation` | `portrait` |
| SW cache | Stale-while-revalidate, update a cada hora |
| Update banner | Aparece quando novo SW disponível |
| Apple | `apple-mobile-web-app-capable: yes` |
| Status bar | `black-translucent` |

---

## 16. Ficheiros do Design System

| Ficheiro | Conteúdo |
|---|---|
| `css/app.css` | Tokens, reset, todos os componentes mobile-first |
| `css/desktop.css` | Overrides desktop via `html.is-desktop` |
| `logo.png` | Logótipo CFMOTO (usado com `filter: invert(1) brightness(2)`) |
| `manifest.json` | Metadados PWA |

---

*Gerado automaticamente a partir do código-fonte · CAR-CLAIM-CKD · 2025*
