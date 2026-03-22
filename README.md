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
| **Repo Search** | Buscá código en todos los repositorios de tu workspace. Soporta **Bitbucket** y **GitHub**. Las credenciales se guardan encriptadas localmente con `safeStorage`. |
| **API Tester** | Cliente HTTP similar a Postman. Soporta colecciones, entornos con variables, historial de requests y autenticación Bearer / Basic. |
| **Settings** | Configuración de API keys, modelo de IA, fuente y tema de color. |

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

### Smart Diff — OpenAI

1. Abrí **Settings** y pegá tu API Key de OpenAI en el campo correspondiente.
2. Seleccioná el modelo (por defecto `gpt-4o-mini`).

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
- **OpenAI SDK** — análisis semántico en Smart Diff
- **chokidar** — file watching en el editor

---

## Seguridad

- Todos los canales IPC tienen una **allowlist explícita** en el preload — canales desconocidos son bloqueados.
- Las rutas de archivo son validadas en el proceso principal antes de cualquier operación.
- Las credenciales sensibles (tokens, API keys) se encriptan con `safeStorage` antes de escribirse a disco.
- El renderer corre con `sandbox: true` y `nodeIntegration: false`.
- Las peticiones HTTPS del API Tester validan certificados TLS.

---

## Changelog

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
