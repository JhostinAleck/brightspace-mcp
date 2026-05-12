# TUI Design — brightspace-mcp tui

## Goal

Replace the Web UI (`brightspace-mcp ui`, Hono + Alpine.js) with a full-screen interactive Terminal User Interface built on Ink 7 + React 19. The new command is `brightspace-mcp tui`.

## Context

The existing web UI had Hono as an undeclared dependency (not in `package.json`), meaning `brightspace-mcp ui` silently fails for anyone who installs from npm. Migrating to a TUI eliminates the HTTP server entirely, adds ~4 MB of declared dependencies (Ink + React), and provides a richer interactive experience directly in the terminal.

## Framework

- **Ink 7** + **React 19** for full-screen terminal rendering
- TypeScript JSX (`"jsx": "react-jsx"`, `"jsxImportSource": "react"` in `tsconfig.json`)
- No new runtime dependencies beyond `ink` and `react`
- `@types/react` and `@testing-library/ink` as dev dependencies

## What Changes

### Removed
- `src/cli/commands/ui.ts`
- `src/ui/` directory (index.html, pages.js, app.js, css/)
- `hono` and `@hono/node-server` from node_modules (were never in `package.json`)

### Added
- `src/cli/commands/tui/` — Ink component tree
- `src/cli/commands/tui.ts` — entry point, mirrors current `ui.ts` structure
- `ink`, `react` in `dependencies`
- `@types/react`, `@testing-library/ink` in `devDependencies`

### Modified
- `src/cli/main.ts`: rename command `ui` → `tui`
- `package.json`: add/remove dependencies
- `tsconfig.json`: add `jsx` and `jsxImportSource`
- `.dependency-cruiser.cjs`: allow `tui/` → `shared-kernel`

## Navigation Structure

```
App
├── TabBar         Inicio | Cursos | Calendario | Config | Caché | Logs
├── InicioView
│   ├── EntregasPanel      assignments pendientes ordenados por fecha
│   ├── AgendaPanel        próximos 7 días (calendar events)
│   └── AnunciosPanel      5 anuncios más recientes cross-cursos
├── CursosView
│   ├── CourseSearch       input con filtro async → courseRepo.findMyCourses()
│   └── CourseDetail
│       ├── SubTabBar      Tareas | Notas | Anuncios
│       ├── TareasView     pendientes vs enviadas
│       ├── NotasView      tabla por evaluación + promedio
│       └── AnunciosCursoView
├── CalendarioView         todos los eventos ordenados por fecha
├── ConfigView
│   ├── ConfigSummary      resumen legible + menú de acciones
│   ├── ConfigForm         campos con dropdowns derivados de Zod schemas
│   └── openInEditor()     spawn $EDITOR → validate → reload
├── CacheView              stats hit/miss + limpiar
└── LogsView               audit log filtrable por tool
```

Every view also renders a persistent `<StatusBar>` at the bottom: perfil activo · estado auth · atajos de teclado.

## Component Interfaces

### TuiDeps

```typescript
export interface TuiDeps {
  courseRepo: CourseRepository;
  gradeRepo: GradeRepository;
  assignmentRepo: AssignmentRepository;
  communicationsRepo: CommunicationsRepository;
  calendarRepo: CalendarRepository;
  auditLogPath: string;
  configPath: string;
  output: OutputContext;
  metrics: MetricsRegistry;
}
```

Identical shape to `UiDeps` (without `contentRepo` which was unused). Injected from `composition-root.ts` exactly as today.

### App props

```typescript
interface AppProps {
  deps: TuiDeps;
}
type Tab = 'inicio' | 'cursos' | 'calendario' | 'config' | 'cache' | 'logs';
```

## Keyboard Map

| Key | Scope | Action |
|-----|-------|--------|
| `Tab` / `→` | global | next tab |
| `Shift+Tab` / `←` | global | previous tab |
| `↑` / `k` | lists | move up |
| `↓` / `j` | lists | move down |
| `Enter` | lists | open / drill-down |
| `Backspace` | CourseDetail | volver a lista de cursos |
| `r` | global | refrescar vista actual |
| `e` | ConfigView | editar con formulario |
| `E` | ConfigView | abrir en `$EDITOR` |
| `Ctrl+S` | ConfigForm | guardar |
| `Esc` | ConfigForm / CourseDetail | cancelar / volver |
| `?` | global | mostrar ayuda |
| `q` / `Ctrl+C` | global | salir |

## InicioView Layout

Three columns rendered side-by-side:

1. **EntregasPanel** — `assignmentRepo.findUpcomingDueDates()`, sorted by due date, color-coded: red (overdue/today), yellow (this week), green (submitted)
2. **AgendaPanel** — `calendarRepo.findUpcoming({ days: 7 })`, grouped by day
3. **AnunciosPanel** — `communicationsRepo.findAnnouncements()` across all courses, 5 most recent sorted by `postedAt`

## ConfigView — Dual Mode

### Summary screen
Renders the active profile's key fields in a readable format (no raw YAML). Action menu:
- **Editar con formulario** (`e`) → opens `ConfigForm`
- **Editar en $EDITOR** (`E`) → spawns `process.env.EDITOR ?? 'nano'`, suspends Ink render, resumes after editor exits, validates YAML, reloads config
- **Re-autenticar** → calls auth refresh
- **Cambiar perfil activo** → `select` over `config.profiles` keys

### ConfigForm
Field-by-field editing using Ink `<TextInput>` and `<SelectInput>` components. Dropdown options are derived at runtime from Zod schemas — never hardcoded:

| Field | Source |
|-------|--------|
| `strategy` | `AuthStrategyKindSchema.options` |
| `mfa_strategy` | `MfaStrategyKindSchema.options` |
| `locale` | `SUPPORTED_LOCALES` array from catalog-loader |
| `format` | `['markdown', 'plain']` (OutputFormat union) |
| `preset` | `BrowserStrategyConfigSchema` shape options |

Validation runs on every change via `configSchema.safeParse()`. Errors shown inline next to the relevant field.

### $EDITOR flow
1. Ink calls `instance.unmount()` to surrender the terminal
2. Spawns editor: `spawnSync(editor, [configPath], { stdio: 'inherit' })`
3. After editor exits, reads and validates the file via `loadConfig()`
4. If valid: reloads deps, remounts Ink, shows success message
5. If invalid: prompts "¿Reabrir editor? [s/n]", loops until valid or user cancels

## CourseSearch

Uses Ink's `<TextInput>` with `onChange` debounced 150 ms → calls `courseRepo.findMyCourses()` → filters by name/code. Shows a spinner (`⠋ Cargando…`) while the first load is in flight, then filters client-side on subsequent keystrokes (courses cached in component state after first fetch).

## Error Handling

- Each view wraps its data fetch in a React error boundary: shows `✗ Error: <message>` with a retry prompt
- Circuit breaker errors surface as `⚠ Sin conexión — r para reintentar`
- Auth errors surface in `StatusBar` as `● auth inválido` + suggestion to press `e` in Config

## Testing

- **Unit tests** with `@testing-library/ink` per component: `TabBar`, `CourseSearch`, `ConfigForm`, `ConfigSummary`
- `ConfigForm` has an explicit test asserting that `strategy` dropdown options equal `AuthStrategyKindSchema.options` (prevents hardcoding drift)
- Repo mocks: same in-memory fakes used in existing unit tests
- **E2E tests** (`tests/e2e/`) are untouched — they test the MCP server, not the TUI

## File Structure

```
src/cli/commands/
├── tui.ts                        entry point (replaces ui.ts)
└── tui/
    ├── App.tsx                   root component, tab state
    ├── TabBar.tsx
    ├── StatusBar.tsx
    ├── views/
    │   ├── InicioView.tsx
    │   ├── CursosView.tsx
    │   ├── CourseDetail.tsx
    │   ├── CalendarioView.tsx
    │   ├── ConfigView.tsx
    │   ├── CacheView.tsx
    │   └── LogsView.tsx
    ├── config/
    │   ├── ConfigSummary.tsx
    │   ├── ConfigForm.tsx
    │   └── openInEditor.ts
    └── shared/
        ├── useAsyncData.ts       hook: loading / error / data pattern
        ├── Spinner.tsx
        └── ErrorBoundary.tsx
tests/unit/tui/
    ├── TabBar.test.tsx
    ├── CourseSearch.test.tsx
    └── ConfigForm.test.tsx
```
