# Phase 01 — Vite + React + TypeScript Project Setup

**Priority:** Critical (blocks all phases)
**Status:** Pending

---

## Overview

Bootstrap `frontend/` directory with Vite + React 18 + TypeScript. Configure Tailwind CSS with OLPAI design tokens from Stitch design system. Set up routing, path aliases, env vars, and dev proxy to backend.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Bundler | Vite 5 |
| Framework | React 18 + TypeScript |
| Styling | Tailwind CSS v3 + custom tokens |
| Routing | React Router v6 |
| State/Data | TanStack Query v5 |
| HTTP client | Axios |
| Forms | React Hook Form + Zod |
| Code editor | CodeMirror 6 (submission) |
| WS | native WebSocket hook |
| Testing | Vitest + React Testing Library |

---

## Design Tokens (from stitch/design-system)

Extract from Stitch `designTheme` into `tailwind.config.ts`:

```ts
// Colors (from namedColors)
colors: {
  background: '#13121b',
  surface: '#13121b',
  'surface-dim': '#13121b',
  'surface-container-low': '#1b1b24',
  'surface-container': '#1f1f28',
  'surface-container-high': '#2a2933',
  'surface-container-highest': '#35343e',
  'surface-container-lowest': '#0e0d16',
  'on-surface': '#e4e1ee',
  'on-surface-variant': '#c7c4d8',
  primary: '#c3c0ff',
  'primary-container': '#4f46e5',
  secondary: '#4cd7f6',
  'secondary-container': '#03b5d3',
  outline: '#918fa1',
  'outline-variant': '#464555',
  error: '#ffb4ab',
  'error-container': '#93000a',
}

// Typography
fontFamily: {
  sans: ['Inter', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}

// Spacing (4px base)
spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', xxl: '48px' }

// Border radius
borderRadius: { sm: '2px', DEFAULT: '4px', md: '6px', lg: '8px', xl: '12px', full: '9999px' }
```

---

## Files to Create

```
frontend/
├── index.html
├── vite.config.ts          # proxy /api → localhost:8080
├── tailwind.config.ts      # OLPAI design tokens
├── tsconfig.json           # path alias @/ → src/
├── tsconfig.node.json
├── postcss.config.js
├── .env.example            # VITE_API_URL=http://localhost:8080
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx             # router setup
    ├── index.css           # @tailwind directives + font imports
    └── vite-env.d.ts
```

---

## Implementation Steps

1. `mkdir frontend && cd frontend && npm create vite@latest . -- --template react-ts`
2. Install deps:
   ```bash
   npm install react-router-dom @tanstack/react-query axios react-hook-form zod @hookform/resolvers
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```
3. Configure `tailwind.config.ts` with full OLPAI token set
4. Import Google Fonts (Inter 400/600/700, JetBrains Mono 500/600) in `index.css`
5. Configure Vite proxy in `vite.config.ts`:
   ```ts
   server: { proxy: { '/api': 'http://localhost:8080' } }
   ```
6. Set up `@/` path alias in both `vite.config.ts` and `tsconfig.json`
7. Scaffold `App.tsx` with `<RouterProvider>` (routes added in Phase 03)
8. Verify: `npm run dev` loads blank dark page with Inter font

---

## Success Criteria

- [ ] `npm run dev` starts without errors
- [ ] Dark background `#13121b` visible in browser
- [ ] Inter font loads from Google Fonts
- [ ] `@/` alias resolves correctly
- [ ] Proxy forwards `/api/*` to `:8080`
- [ ] `npm run build` produces clean dist
