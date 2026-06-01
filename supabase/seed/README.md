# Seed de datos locales → Supabase

## Opción A — Script Node (recomendado)

Usa tu `.env` y sube todo por API:

```bash
node scripts/seed-supabase-from-local.mjs
```

## Opción B — SQL generado

Genera un archivo con todos los `INSERT`:

```bash
node scripts/generate-supabase-seed-sql.mjs
```

Luego en Supabase → **SQL Editor**, ejecutá:

1. `supabase/migrations/001_gastos_schema.sql` (si aún no lo hiciste)
2. `supabase/seed/generated/002_seed_from_local.sql`

## Fuente de datos

Por defecto lee:

- macOS: `~/Library/Application Support/mytools-app/`
- Windows: `%APPDATA%/mytools-app/`
- Linux: `~/.config/mytools-app/`

Otro path:

```bash
node scripts/generate-supabase-seed-sql.mjs --user-data "/ruta/custom"
```

## Notion

Estos scripts **no** llaman a Notion. Si tenés datos solo ahí, sincronizá primero desde Gastos → **Sync Notion** y volvé a ejecutar el script.

## Credenciales

En tu export local las contraseñas están vacías; `password_enc` queda vacío. Para cifrar contraseñas como la app, usá **Migrar** en Conexiones → Supabase dentro de Setto (Electron `safeStorage`).

El SQL generado contiene datos sensibles (queries, usuarios). No lo subas a Git (`generated/` está en `.gitignore`).
