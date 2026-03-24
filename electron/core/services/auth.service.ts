import { safeStorage, shell } from 'electron'
import http from 'http'
import crypto from 'crypto'
import type { DatabaseService } from './db.service'

const GOOGLE_AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO   = 'https://www.googleapis.com/oauth2/v3/userinfo'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

// Injected at build time from .env — never appear in source code.
// See electron.vite.config.ts → main.define
declare const __GOOGLE_CLIENT_ID__:     string
declare const __GOOGLE_CLIENT_SECRET__: string

const AUTH_FILE  = 'google-auth.json'
const ENC_PREFIX = 'enc:'
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

interface StoredAuth {
  access_token:  string   // encrypted
  refresh_token: string   // encrypted
  email:   string
  name:    string
  picture: string
  expires_at: number
}

export interface GoogleUser {
  email:   string
  name:    string
  picture: string
}

export class AuthService {
  private stored: StoredAuth | null

  constructor(private db: DatabaseService) {
    this.stored = db.readJSON<StoredAuth>(AUTH_FILE)
  }

  // ── Encryption helpers ───────────────────────────────────────────────────

  private encrypt(value: string): string {
    if (!value) return value
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
    }
    return value
  }

  private decrypt(raw: string): string {
    if (!raw) return raw
    if (raw.startsWith(ENC_PREFIX)) {
      try {
        return safeStorage.decryptString(Buffer.from(raw.slice(ENC_PREFIX.length), 'base64'))
      } catch {
        return ''
      }
    }
    return raw
  }

  // ── Public API ───────────────────────────────────────────────────────────

  getUser(): GoogleUser | null {
    if (!this.stored) return null
    return {
      email:   this.stored.email,
      name:    this.stored.name,
      picture: this.stored.picture,
    }
  }

  async logout(): Promise<void> {
    if (this.stored) {
      // Best-effort token revocation — do not throw on failure
      const token = this.decrypt(this.stored.access_token)
      if (token) {
        fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`).catch(() => null)
      }
    }
    this.stored = null
    this.db.writeJSON(AUTH_FILE, null)
  }

  /**
   * Starts the Google OAuth 2.0 flow for a Desktop app.
   * Opens the user's default browser and waits for the redirect to
   * a localhost callback server. Resolves with the authenticated user
   * or rejects on error / timeout / denial.
   */
  async startOAuth(): Promise<GoogleUser> {
    const clientId     = __GOOGLE_CLIENT_ID__
    const clientSecret = __GOOGLE_CLIENT_SECRET__

    if (!clientId) throw new Error('Google OAuth not configured (missing CLIENT_ID)')

    const codeVerifier  = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    const port        = await this.findFreePort()
    const redirectUri = `http://localhost:${port}`

    const authUrl = new URL(GOOGLE_AUTH_URL)
    authUrl.searchParams.set('client_id',             clientId)
    authUrl.searchParams.set('redirect_uri',          redirectUri)
    authUrl.searchParams.set('response_type',         'code')
    authUrl.searchParams.set('scope',                 'openid email profile')
    authUrl.searchParams.set('code_challenge',        codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('access_type',           'offline')
    authUrl.searchParams.set('prompt',                'consent')

    return new Promise((resolve, reject) => {
      let settled = false

      const done = (fn: () => void): void => {
        if (settled) return
        settled = true
        server.close()
        clearTimeout(timer)
        fn()
      }

      const server = http.createServer(async (req, res) => {
        if (!req.url) return

        const url   = new URL(req.url, `http://localhost:${port}`)
        const code  = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        // Always close the browser tab with a friendly message
        const html = (msg: string): string =>
          `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;">
            <h2>${msg}</h2><p>You can close this tab and return to Setto Toolkit.</p>
          </body></html>`

        if (error || !code) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(html('Authentication cancelled.'))
          done(() => reject(new Error(error ?? 'No code received')))
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html('Authenticated successfully!'))

        done(async () => {
          try {
            // Exchange auth code + PKCE verifier for tokens
            const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code,
                client_id:     clientId,
                client_secret: clientSecret,
                redirect_uri:  redirectUri,
                grant_type:    'authorization_code',
                code_verifier: codeVerifier,
              }),
            })
            const tokens = (await tokenRes.json()) as {
              access_token:  string
              refresh_token?: string
              expires_in:    number
              error?:        string
              error_description?: string
            }
            if (tokens.error) throw new Error(tokens.error_description ?? tokens.error)

            // Fetch Google profile
            const userRes = await fetch(GOOGLE_USERINFO, {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            })
            const profile = (await userRes.json()) as {
              email: string; name: string; picture: string
            }

            const stored: StoredAuth = {
              access_token:  this.encrypt(tokens.access_token),
              refresh_token: this.encrypt(tokens.refresh_token ?? ''),
              email:         profile.email,
              name:          profile.name,
              picture:       profile.picture,
              expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
            }
            this.stored = stored
            this.db.writeJSON(AUTH_FILE, stored)

            resolve({ email: profile.email, name: profile.name, picture: profile.picture })
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        })
      })

      // Timeout safety net
      const timer = setTimeout(() => {
        done(() => reject(new Error('TIMEOUT')))
      }, OAUTH_TIMEOUT_MS)

      server.listen(port, '127.0.0.1', () => {
        shell.openExternal(authUrl.toString()).catch(() => null)
      })

      server.on('error', (err) => done(() => reject(err)))
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer()
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address() as { port: number }
        srv.close(() => resolve(addr.port))
      })
      srv.on('error', reject)
    })
  }
}
