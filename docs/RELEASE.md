# Publicar una versión

Las versiones se publican **sólo desde GitHub Actions** (`.github/workflows/release.yml`), nunca
desde una PC de desarrollo. El instalador queda en GitHub Releases, que es el feed del
auto-actualizador (`electron-updater`, `build.publish` en `package.json`).

## Pasos

1. **Versión**: subir `version` en `package.json` (semver: `X.Y.Z`). `npm version X.Y.Z --no-git-tag-version`
   actualiza también `package-lock.json`.
2. **CHANGELOG**: renombrar `## X.Y.Z (sin publicar)` a `## X.Y.Z` en `CHANGELOG.md`. Es lo que ve el
   usuario en "Novedades" y en Ajustes → Acerca de (`changelogSection` busca el encabezado por versión).
3. **Verificar** en local:
   ```
   npm run typecheck
   npm test
   npm run test:e2e          # build + Playwright (perfil temporal, no toca tus datos)
   ```
4. **Commit** (`chore: release vX.Y.Z`) y push a `main`.
5. **Tag**: `git tag vX.Y.Z && git push origin vX.Y.Z`. El push del tag `v*` dispara el workflow:
   `npm ci` → `npm run rebuild` (node-pty) → typecheck → tests → `electron-vite build` → chequeo de
   que `out/main/main.js` no tenga JWT → `electron-builder --win --publish always`.
6. **Revisar** la release en GitHub (se crea publicada, `releaseType: release`) y probar la
   actualización desde una instalación anterior (Ajustes → Acerca de → "Buscar actualizaciones").

Si el workflow falla, borrar el tag (`git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`),
corregir y volver al paso 4. No reutilizar un número de versión ya publicado.

## Firma de código en Windows (pendiente)

Hoy el instalador **no está firmado**: SmartScreen muestra "Windows protegió su PC" hasta que el
archivo junta reputación. `electron-updater` funciona igual (verifica el sha512 del `latest.yml`).
Para firmar más adelante hay dos caminos; los dos usan **secretos del repositorio**, nunca archivos
en el repo ni valores en `package.json`.

### Opción A — Azure Trusted Signing (recomendada)

Certificado administrado por Microsoft, sin token USB, barato y con reputación de SmartScreen
asociada a la identidad verificada.

1. En Azure: crear una cuenta de *Trusted Signing*, validar la identidad y crear un *certificate
   profile* (Public Trust). Crear un App Registration con el rol *Trusted Signing Certificate
   Profile Signer* sobre la cuenta.
2. En GitHub → Settings → Secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
3. En `package.json` → `build.win` (electron-builder ≥ 25 lo soporta nativo):
   ```json
   "azureSignOptions": {
     "publisherName": "<CN exacto del certificado>",
     "endpoint": "https://<región>.codesigning.azure.net",
     "codeSigningAccountName": "<cuenta>",
     "certificateProfileName": "<perfil>"
   }
   ```
4. En `release.yml`, paso de electron-builder:
   ```yaml
   env:
     GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
     AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
     AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
   ```

### Opción B — Certificado .pfx (OV/EV)

1. Exportar el certificado a `.pfx`, pasarlo a base64 y guardarlo como secreto `WIN_CSC_LINK`
   (electron-builder acepta base64 en `CSC_LINK`); la contraseña en `WIN_CSC_KEY_PASSWORD`.
2. En `release.yml`:
   ```yaml
   env:
     CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
     CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
   ```
   (Los certificados EV en token físico no sirven en un runner de GitHub: usar la opción A o un HSM en la nube.)

### Después de activar la firma

- Agregar `"publisherName"` en `build.win` (o el de `azureSignOptions`): `electron-updater` verifica que
  las actualizaciones nuevas vengan firmadas por el mismo publicador. **La primera versión firmada**
  la reciben bien las instalaciones sin firma; a partir de ahí, cambiar de certificado/CN rompe la
  actualización automática (habría que reinstalar).
- Verificar en el runner o en local: `signtool verify /pa /v release\Setto-Setup-X.Y.Z.exe`.
- Opción B: sin `CSC_LINK` (forks, PRs) electron-builder no firma y el build sigue. Opción A: con
  `azureSignOptions` en `package.json` y sin credenciales el build **falla** — para builds locales
  (`npm run package`) pasar `-c.win.azureSignOptions=null` o mover la config a un archivo usado sólo por el workflow.
