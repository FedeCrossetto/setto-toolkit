# Setto Toolkit

**Setto Toolkit** es una aplicación de escritorio modular para desarrolladores, construida con Electron + React + TypeScript. Reúne en un solo lugar las utilidades del día a día: edición de archivos, comparación de código con IA, búsqueda en repositorios y prueba de APIs.

<table>
  <tr>
    <td><img src="public/portada-light.png" alt="Tema claro" /></td>
    <td><img src="public/portada-black.png" alt="Tema oscuro" /></td>
  </tr>
</table>

---

## Herramientas incluidas

| Plugin | Descripción |
|---|---|
| **File Editor** | Abrí, editá y guardás archivos. Soporte para logs grandes con modo tail, file watcher y búsqueda en archivos. |
| **Smart Diff** | Comparación semántica de dos fragmentos de código con análisis de IA (OpenAI). Detecta cambios de lógica, efectos secundarios y sugiere mejoras. |
| **Repo Search** | Buscá código en todos los repositorios de tu workspace. Soporta **Bitbucket**, **GitHub** y **GitLab**. Las credenciales se guardan encriptadas localmente con `safeStorage`. |
| **API Tester** | Cliente HTTP similar a Postman. Soporta colecciones, entornos con variables, historial, autenticación Bearer / Basic, multipart/form-data y scripts pre/post-request. |
| **Settings** | Configuración de API keys, proveedor de IA (OpenAI / Anthropic / Ollama), fuente, tema de color y backup/restore de settings. |
| **About** | Información de versión, stack tecnológico y detalles de seguridad de la app. |

---

## Requisitos

- [Node.js](https://nodejs.org/) v18 o superior
- npm v9 o superior

---

## Instalación y desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/FedeCrossetto/setto-toolkit.git
cd setto-toolkit

# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run dev
```

La app se abre automáticamente como ventana de escritorio (Electron).

---

## Build para producción

```bash
npm run package
```

El instalador queda en la carpeta `release/`.

---

## Configuración de credenciales

Todas las credenciales se configuran **desde dentro de la app** en la pantalla correspondiente. Nunca se hardcodean en el código fuente — se almacenan encriptadas en el dispositivo mediante la API `safeStorage` de Electron (DPAPI en Windows, Keychain en macOS).

### Repo Search — Bitbucket

1. Abrí el plugin **Repo Search** y seleccioná la pestaña **Bitbucket**.
2. Ingresá tu usuario, tu workspace y un **App Password** con permisos de lectura de repositorios.
   - Para crear un App Password: Bitbucket → Configuración personal → App passwords → permisos de lectura en Repositories.
3. Hacé clic en **Connect**. Las credenciales se guardan encriptadas y se reutilizan en sesiones futuras.

### Repo Search — GitHub

1. Seleccioná la pestaña **GitHub**.
2. Ingresá un **Personal Access Token** (classic o fine-grained) con scope `repo` o `read:org`.
   - Para crear uno: GitHub → Settings → Developer settings → Personal access tokens.
3. Opcionalmente podés especificar una organización para acotar la búsqueda.

### Repo Search — GitLab

1. Seleccioná la pestaña **GitLab**.
2. Ingresá un **Personal Access Token** con scopes `api` y `read_api`.
   - Para crear uno: GitLab → Preferences → Access Tokens.
3. Opcionalmente podés especificar un grupo para acotar la búsqueda a sus proyectos.

### Smart Diff — Proveedor de IA

Abrí **Settings → AI Service** y elegí el proveedor:

- **OpenAI**: pegá tu API Key y seleccioná el modelo (`gpt-4o-mini` por defecto).
- **Anthropic**: pegá tu API Key y seleccioná el modelo Claude (`claude-haiku-4-5` por defecto).
- **Ollama (local)**: ingresá la URL de tu instancia (`http://localhost:11434`) y el nombre del modelo. No requiere API key.

---

## Agregar un plugin

La arquitectura es completamente modular. Para agregar una nueva herramienta:

1. Crear la carpeta `src/plugins/<nombre>/` con el componente React y su `index.ts`.
2. Si necesita lógica de backend (acceso al sistema de archivos, red, etc.), crear `electron/plugins/<nombre>/handlers.ts`.
3. Registrar el plugin en:
   - `src/core/plugin-registry.ts`
   - `electron/core/plugin-loader.ts` (si tiene handlers)
   - `electron/preload.ts` (agregar los canales IPC necesarios a la allowlist)

Podés usar `src/plugins/_template/` como punto de partida.

---

## Stack tecnológico

- **Electron** — runtime de escritorio
- **React 18 + TypeScript** — interfaz de usuario
- **Vite + electron-vite** — bundler y dev server
- **CodeMirror 6** — editor de código
- **Tailwind CSS** — estilos
- **OpenAI / Anthropic / Ollama** — análisis semántico en Smart Diff (multi-proveedor)
- **chokidar** — file watching en el editor

---

## Seguridad

- Todos los canales IPC tienen una **allowlist explícita** en el preload — canales desconocidos son bloqueados.
- Las rutas de archivo son validadas en el proceso principal antes de cualquier operación (path traversal + authorized roots).
- Las credenciales sensibles (tokens, API keys de OpenAI, Anthropic, GitLab) se encriptan con `safeStorage` antes de escribirse a disco.
- El **cache de IA** (`ai-cache.json`) se encripta en disco con `safeStorage` (prefijo `ENCV1:`).
- Las API keys nunca se retornan al renderer en texto plano — se usa un centinela `__CONFIGURED__`.
- El renderer corre con `sandbox: true` y `nodeIntegration: false`.
- Los scripts de pre/post-request en el API Tester corren en un `vm.runInNewContext` aislado con timeout de 2s.
- Las peticiones HTTPS del API Tester validan certificados TLS.

---

## Changelog

### v2.0.0 — 2026-03-23

#### Nuevas funcionalidades

**Multi-proveedor AI (Smart Diff)**
- Soporte para **OpenAI**, **Anthropic Claude** y **Ollama** (local, sin API key).
- Selector de proveedor en Settings con campos condicionales por proveedor.
- Los modelos disponibles se listan en un dropdown por proveedor.

**API Tester — Scripts pre/post-request**
- Nuevo tab **Scripts** en cada request.
- El script de pre-request puede mutar variables de entorno antes del envío (`pm.environment.set/get`).
- El script de post-response accede a `pm.response.status`, `pm.response.json()`, `pm.response.body`.
- Ejecución sandboxada via `vm.runInNewContext` con timeout de 2 segundos.

**API Tester — Soporte multipart/form-data**
- Nuevo body type `form-data` con editor de campos clave/valor.
- Soporte para adjuntar archivos directamente desde el editor.

**Repo Search — GitLab**
- Tercera pestaña de proveedor con autenticación por Personal Access Token.
- Búsqueda de código por scope `blobs` en todos los proyectos accesibles o en un grupo específico.
- Token almacenado cifrado con `safeStorage`.

**Historial de búsqueda persistido (Repo Search)**
- El historial de queries deja de usar `localStorage` y se guarda en `userData` via IPC (`repo-search-history.json`).
- Persiste entre reinstalaciones del renderer y está disponible en el proceso principal.

**Backup & Restore de settings**
- Nuevo botón **Export JSON** en Settings: guarda configuración no sensible (modelos, workspace, aliases) en un archivo local.
- Botón **Import JSON**: carga y aplica la configuración desde un archivo. Las API keys nunca se exportan ni importan desde archivo.

**Plugin About**
- Nueva pantalla con versión de la app, stack tecnológico y detalles de seguridad.

#### Mejoras de UX

- **Dirty indicator**: punto de color en el tab del File Editor cuando hay cambios sin guardar.
- **Modal de confirmación** al eliminar archivos/carpetas (reemplaza `window.confirm`).
- **ErrorBoundary por plugin**: si un plugin falla, muestra un card de error con botón "Try again" sin romper el resto de la app.
- **Toast system**: notificaciones no bloqueantes en esquina inferior derecha (success / error / warning / info).
- **Sidebar collapse persistido**: el estado colapsado/expandido de la barra lateral se guarda en `localStorage`.
- **Word-level diff**: en Smart Diff, las líneas modificadas resaltan las palabras exactas que cambiaron (no solo la línea completa).
- **AI Insights scrolleable**: el panel de análisis de IA en Smart Diff tiene altura mínima y scroll interno.
- **Banner de onboarding**: aparece en el Dashboard si no hay proveedor de IA configurado, con acceso directo a Settings.

#### Seguridad

- **AI cache encriptado**: `ai-cache.json` se cifra con `safeStorage` (prefijo `ENCV1:`). Migración transparente desde archivos planos existentes.
- **Anthropic key cifrada** con `safeStorage` (mismo mecanismo que OpenAI key y tokens de Bitbucket/GitHub).
- **GitLab token cifrado** con `safeStorage`.
- **Settings allowlist ampliada**: nuevas keys de AI y GitLab validadas explícitamente en el handler de IPC.
- **Authorized roots para File Editor**: las operaciones de escritura/borrado solo se permiten en directorios previamente autorizados por el usuario.

---

### v1.0.1 — 2026-03-22

#### Repo Search — mejoras de UI y funcionalidad
- **Agrupación por repo** con secciones colapsables y contador de matches por grupo.
- **Alias de repos** configurables desde la sidebar: mapeá nombres de repositorios a un alias común y los resultados se fusionan en un único grupo.
- **Estado persistente por proveedor**: al cambiar entre las pestañas Bitbucket y GitHub los resultados y la búsqueda anterior se conservan.
- **Historial de búsqueda** guardado en `localStorage`, con dropdown al enfocar el input y botón para limpiar.
- **Atajos de teclado**: `/` enfoca el input de búsqueda desde cualquier parte de la pantalla.
- **Resaltado de sintaxis** en los snippets de código (keywords, strings, números, comentarios).
- **Path breadcrumb** con segmentos de ruta y branch en cada resultado.
- **Copiar snippet** con feedback visual ("Copiado") en cada card de resultado.
- **Sugerencias en estado vacío** (chips de búsqueda comunes como `TODO`, `FIXME`, `console.log`, etc.).
- **Filtro lateral por repo** con contadores de coincidencias.
- **Estilo**: tabs de proveedor y botón Buscar cambiados de `rounded-full` a `rounded-lg` para coherencia con el resto del diseño.
- **Fix**: solo se muestran las líneas que contienen la coincidencia real; se descartan las líneas de contexto que devuelve la API de Bitbucket.
- **Fix**: error `SyntaxError: Unexpected end of JSON input` en el login de Bitbucket cuando la respuesta HTTP no tenía body JSON.
- **Fix**: soporte multi-proveedor completo (Bitbucket + GitHub) con credenciales aisladas por proveedor.

#### Dashboard
- Cards con zona de artwork transparente: el panda flota sobre el fondo del card sin contraste de color de fondo.
- Glow suave en el color del plugin debajo de cada panda.
- Animación de flotación suave (`pandaFloat`) en todas las ilustraciones.
- Fix: imagen del panda no aparecía en la card de Repo Search (key `bitbucket-search` → `repo-search`).

#### Seguridad (parches aplicados en el commit inicial, documentados aquí)
- IPC allowlist explícita en `preload.ts` — canales desconocidos bloqueados.
- `shell.openExternal` restringido a protocolos `http:` y `https:`.
- Validación de rutas de archivo en todos los handlers del File Editor (null bytes, path traversal, profundidad mínima en delete).
- Tokens y API keys encriptados con `safeStorage` (DPAPI en Windows, Keychain en macOS).
- Reemplazado `execSync` por `execFileSync` con argumentos en array para eliminar inyección de shell.
- Removido `rejectUnauthorized: false` del API Tester (TLS válido requerido).
- Protección SSRF en paginación de Bitbucket (`nextUrl` validado contra la URL base de la API).

---

### v1.0.0 — lanzamiento inicial

- **File Editor**: apertura, edición y guardado de archivos. Modo tail para logs grandes, file watcher y búsqueda en archivos.
- **Smart Diff**: comparación semántica de código con análisis de IA (OpenAI). Detecta cambios de lógica, efectos secundarios y sugiere mejoras.
- **Repo Search**: búsqueda de código en repositorios de Bitbucket y GitHub. Credenciales encriptadas con `safeStorage`.
- **API Tester**: cliente HTTP tipo Postman con colecciones, entornos, historial y autenticación Bearer / Basic.
- **Settings**: configuración de API keys, modelo de IA, fuente y tema de color.
- **Dashboard**: pantalla de inicio con cards animadas por herramienta.
- Arquitectura de plugins modular (IPC handlers + registro de plugins).
- Tema claro y oscuro.

---

## Licencia

MIT
