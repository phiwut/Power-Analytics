# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Power Analytics (`artifacts/power-analytics`)

Frontend-only React + Vite analytics tool for electrical power measurement files (TXT/CSV from power quality analyzers, energy meters, data loggers).

**Features**: drag-drop file import, automatic delimiter and decimal-format detection (German `1.234,56` and English `1,234.56`), German+English column header recognition (Spannung/Voltage, Strom/Current, Wirkleistung/Power, etc.), interactive zoomable Recharts time-series with toggleable metrics, dual y-axis grouping by unit, KPI strip with health-coded coloring, automatic insights (voltage stability, phase imbalance, THD, PF, neutral, frequency, spike detection, cyclic-load detection), peak-shaving battery sizing, configurable engineering thresholds, PDF/CSV/JSON export, light/dark mode.

**Key files**:
- `src/lib/parser.ts` — file parsing (papaparse), delimiter+decimal detection, column-map regex matching, German/English number parsing
- `src/lib/analysis.ts` — KPIs, insights with severity, hourly profile, spikes, battery sizing, METRIC_SERIES catalog, downsample
- `src/lib/export.ts` — CSV/JSON/PDF (jspdf + autotable) and chart PNG (html2canvas)
- `src/pages/Dashboard.tsx` — main page; loads sample from `public/sample.txt`
- `src/components/MainChart.tsx` — Recharts time-series with brush-zoom and metric chips
- `src/components/{KpiCard,InsightsPanel,PhaseGauges,HourlyHeatmap,BatteryCard,ThresholdsPanel,SpikesTable,AppHeader,FileDropzone}.tsx`

**Sample data**: `public/sample.txt` (German tab-separated, 33 rows, 102 columns).
