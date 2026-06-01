# Guía: migrar Gastos, Contraseñas y Queries a Supabase

Esta guía explica **desde cero** cómo conectar Setto con Supabase. No hace falta que entiendas todos los archivos del repo: al final hay un resumen de **qué es obligatorio y qué no**.

---

## ¿Qué vas a lograr?

Hoy Setto guarda estos datos en tu Mac/PC (carpeta interna de la app, no en el repo):

| Módulo en la app | Archivo interno | ¿Notion? |
|------------------|-----------------|----------|
| Servicios (Metrogas, etc.) | `gastos-servicios.json` | No |
| Pagos / gastos mensuales | `gastos-pagos.json` | Opcional (sync) |
| Contraseñas | `gastos-credenciales.json` | Solo nombre/usuario (sin password) |
| Queries SQL | `queries.json` | Opcional (sync) |

Después de migrar, la app puede usar **Supabase** como base de datos en la nube en lugar de esos JSON.

---

## Lo más importante: ¿necesito un `.env`?

**No, para Supabase no es obligatorio.**

| Forma de configurar | ¿Obligatorio? | Cuándo usarla |
|---------------------|---------------|---------------|
| **Conexiones → Supabase** en la app | Recomendada | Uso normal: pegás URL y clave una vez y listo |
| Archivo `gastos-supabase.local.json` | Opcional | Solo si desarrollás y querés credenciales en el repo (gitignored) |
| Variables en `.env` | Opcional | Solo si ya usás `.env` para OAuth y querés las mismas credenciales de Supabase ahí |

### ¿Y el archivo `.env.example` del repo?

- `.env.example` es una **plantilla de ejemplo**. No la usa la app sola.
- El proyecto **no trae** un `.env` (está en `.gitignore` por seguridad).
- Ese `.env` sirve sobre todo para **Google / GitHub / GitLab OAuth** al compilar la app (`npm run dev` / `npm run package`).
- Las líneas de Supabase al final del `.env.example` están **comentadas** (`#`): son opcionales.

**Si no tenés `.env`:** no pasa nada para esta migración. Configurá todo desde **Conexiones → Supabase**.

**Si querés crear `.env` igual** (por OAuth u otras cosas):

```bash
cd /ruta/al/repo/setto-toolkit
cp .env.example .env
# Editá .env con un editor de texto y completá solo lo que uses
```

No subas `.env` a Git.

---

## Parte 1 — Crear el proyecto en Supabase

1. Entrá a [https://supabase.com](https://supabase.com) e iniciá sesión.
2. **New project** (o “Nuevo proyecto”).
3. Elegí organización, **nombre del proyecto**, **contraseña de la base de datos** (guardala; es para Postgres, no la usa Setto directamente).
4. Región cercana a vos → **Create new project**.
5. Esperá 1–2 minutos hasta que el proyecto esté en verde / “Active”.

Anotá el **nombre del proyecto** (ej. `setto-gastos`). La URL del proyecto suele ser:

`https://<referencia-del-proyecto>.supabase.co`

---

## Parte 2 — Dónde está el **Project URL** (paso a paso)

La interfaz de Supabase cambia a veces; probá en este orden:

### Opción A (la más común)

1. Abrí tu proyecto en el dashboard.
2. Abajo a la izquierda, clic en el **ícono de engranaje** → **Project Settings** (Configuración del proyecto).
3. En el menú lateral de settings, entrá a **API** (a veces dice **Data API** o **API Keys**).
4. Arriba de la página deberías ver algo como:
   - **Project URL**, o
   - **URL** bajo “Project URL” / “API URL”

   Ejemplo de valor correcto:

   ```text
   https://abcdefghijklmnop.supabase.co
   ```

   Copiá esa URL **completa** (con `https://`).

### Opción B (si no ves “Project URL”)

1. En el mismo proyecto, menú lateral izquierdo (no settings): **Home** / **Project overview**.
2. A veces aparece un bloque **“Project API”** o **“Connect”** con la URL.
3. O: **Connect** → **App frameworks** → ahí suele mostrar la URL del proyecto.

### Opción C (desde la barra del navegador)

Si estás en una página del proyecto, la referencia suele ser el subdominio:

`https://**ESTA-PARTE**.supabase.co`

Esa URL completa es la que va en Setto.

### ¿Qué NO copiar?

| Clave / dato | ¿Sirve como Project URL? |
|--------------|---------------------------|
| `https://xxx.supabase.co` | Sí |
| `postgresql://postgres:...` (Connection string) | No — es para Postgres directo |
| `anon` / `publishable` key | No — es otra cosa (ver abajo) |
| Database password | No |

---

## Parte 3 — Dónde está la **service_role** key

Setto usa la clave **service_role** (secreta) solo en el proceso principal de Electron, nunca en la ventana web visible.

1. **Project Settings** (engranaje) → **API** o **API Keys**.
2. Buscá la sección de claves. Puede llamarse:
   - **Project API keys**
   - **API Keys**
   - Pestaña **Legacy API Keys** (en proyectos más viejos)
3. Vas a ver al menos dos tipos:

| Nombre en Supabase | ¿Usar en Setto? |
|------------------|-----------------|
| `anon` / `publishable` | No (para apps web públicas con reglas RLS) |
| **`service_role`** / **secret** | **Sí** — esta va en Setto |

4. En `service_role`, clic en **Reveal** / **Show** / el ícono del ojo y copiá la clave.
5. Empieza con `eyJ...` (es un JWT largo).

**Importante:** no la compartas, no la subas a GitHub, no la pegues en una web pública. En Setto queda guardada cifrada en tu máquina.

---

## Parte 4 — Crear las tablas en Supabase (SQL)

1. En el menú del proyecto: **SQL Editor** (Editor SQL).
2. **New query** (Nueva consulta).
3. En tu repo, abrí el archivo:

   `supabase/migrations/001_gastos_schema.sql`

4. Copiá **todo** el contenido y pegalo en el editor de Supabase.
5. **Run** / **Ejecutar**.
6. Debería decir éxito (sin errores en rojo). Eso crea las tablas: `servicios`, `pagos`, `credenciales`, `queries`.

Si falla porque “la tabla ya existe”, probablemente ya corriste el script antes; en un proyecto nuevo no debería pasar.

---

## Parte 5 — Configurar Setto (sin `.env`)

1. Abrí Setto (`npm run dev` o la app empaquetada).
2. Andá a **Conexiones** (plugin Connections).
3. Expandí la sección **Supabase**.
4. Completá:
   - **Project URL** → la URL de la Parte 2.
   - **Service role key** → la clave de la Parte 3.
   - **Backend activo** → dejá **Local** hasta terminar la migración.
5. Clic en **Guardar** (o el botón de guardar de esa sección).

La app guarda esto en tu carpeta de usuario (no en el repo), cifrando la clave secreta.

---

## Parte 6 — Migrar tus datos

### Antes de migrar

- Si **solo** tenés datos en **Notion** y la app local está vacía:
  1. Configurá Notion en **Conexiones → Notion** (si aún no lo hiciste).
  2. En el módulo **Gastos**, usá **Sync Notion** en cada pestaña que uses.
  3. Así los datos bajan primero a los JSON locales y después la migración los sube a Supabase.

- Si ya usás la app y ves servicios/pagos/contraseñas/queries, podés migrar directo.

### Ejecutar la migración

1. **Conexiones → Supabase**.
2. Verificá que URL y service role estén guardados.
3. Clic en **Migrar datos locales a Supabase**.
4. Si todo va bien, verás un resumen (cantidad de servicios, pagos, etc.).
5. Cambiá **Backend activo** a **Supabase** y **Guardá** otra vez.

La app hace copia de seguridad de los JSON locales con nombre tipo `*.pre-supabase-<timestamp>.bak` en la carpeta interna de datos de la app.

---

## Parte 7 — Configuración opcional por archivos (solo desarrolladores)

Usá esto **solo si preferís** no usar la UI o querés compartir config entre máquinas de desarrollo.

### Archivo `gastos-supabase.local.json` (opcional)

En la **raíz del repo** (misma carpeta que `package.json`):

```bash
cp gastos-supabase.local.example.json gastos-supabase.local.json
```

Contenido de ejemplo:

```json
{
  "url": "https://TU_REFERENCIA.supabase.co",
  "serviceKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "backend": "local"
}
```

| Campo | Qué poner |
|-------|-----------|
| `url` | Project URL (Parte 2) |
| `serviceKey` | service_role key (Parte 3) |
| `backend` | `"local"` hasta migrar; después `"supabase"` |

Este archivo está en `.gitignore` — no se sube a Git.

**Prioridad:** si guardás algo en **Conexiones → Supabase**, eso suele prevalecer sobre el JSON local.

### Variables en `.env` (opcional)

Solo si ya tenés un `.env` en la raíz del repo. Agregá o descomentá:

```env
SUPABASE_URL=https://TU_REFERENCIA.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...tu_service_role_completa...
```

| Variable | Valor |
|----------|--------|
| `SUPABASE_URL` | Igual que Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Igual que service_role (no la `anon`) |

Reiniciá `npm run dev` después de cambiar `.env`.

**Prioridad aproximada:** Conexiones (settings cifrados) → `gastos-supabase.local.json` → `.env` → archivo `gastos-supabase.json` en userData.

---

## Resumen rápido: checklist

- [ ] Proyecto creado en supabase.com  
- [ ] Project URL copiada (Settings → API)  
- [ ] service_role copiada (no anon)  
- [ ] SQL `001_gastos_schema.sql` ejecutado en SQL Editor  
- [ ] Setto → Conexiones → Supabase → URL + clave → Guardar  
- [ ] (Si aplica) Sync Notion antes de migrar  
- [ ] Botón **Migrar datos locales a Supabase**  
- [ ] Backend = **Supabase** → Guardar  

**No necesitás:** crear `.env` solo por Supabase.

---

## Seguridad (breve)

- **Contraseñas:** se guardan en dos lugares al guardar en la app: vault local (`gastos-credenciales-passwords.vault`) y columna `password_enc` en Supabase (cifrado `safeStorage`, base64 — no es texto plano en el Table Editor).
- `password_enc` solo se puede descifrar en la **misma Mac** que guardó; en otra PC reingresá la clave o copiá el vault local.
- La `service_role` bypass las reglas RLS: tratá esa clave como una contraseña de administrador.

---

## Problemas frecuentes

| Error / síntoma | Qué revisar |
|-----------------|-------------|
| `SUPABASE_NOT_CONFIGURED` | Falta URL o service_role en Conexiones → Supabase |
| `Invalid API key` | Copiaste `anon` en lugar de `service_role`, o la clave está truncada |
| `relation "servicios" does not exist` | No ejecutaste el SQL de `001_gastos_schema.sql` |
| Migración con 0 registros | Datos solo en Notion → hacé Sync Notion primero |
| No encuentro Project URL | Parte 2, opciones A/B/C |

---

## Poblar tablas desde tus datos locales (scripts)

Si querés subir lo que ya tenés en `~/Library/Application Support/mytools-app/` sin usar el botón de la app:

### Opción A — SQL (no requiere service_role en `.env`)

```bash
npm run supabase:seed:sql
```

Genera `supabase/seed/generated/002_seed_from_local.sql`. En Supabase → **SQL Editor**, ejecutalo después del `001_gastos_schema.sql`.

### Opción B — API (requiere service_role)

Agregá en `.env` (además de la URL):

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **no sirve** para insertar datos (es la clave pública).

```bash
npm run supabase:seed
```

Detalle: `supabase/seed/README.md`.

**Notion:** los scripts leen solo JSON local. Si falta algo, hacé Sync Notion en Gastos y volvé a ejecutar el script.

---

## Volver a guardar solo en local

**Conexiones → Supabase** → **Backend activo** → **Local (JSON en userData)** → Guardar.

Los datos en Supabase no se borran; la app deja de leer/escribir ahí hasta que vuelvas a elegir Supabase.
