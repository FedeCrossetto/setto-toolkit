import { useState, useEffect } from 'react'
import { LogOut, MoreVertical } from 'lucide-react'

interface GoogleUser {
  email:   string
  name:    string
  picture: string
}

interface GoogleAuthWidgetProps {
  collapsed: boolean
  onSignIn?: (user: GoogleUser) => void
}

export function GoogleAuthWidget({ collapsed, onSignIn }: GoogleAuthWidgetProps): JSX.Element {
  const [user, setUser]       = useState<GoogleUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    window.api.invoke<GoogleUser | null>('auth:google-user').then(setUser).catch(() => null)
  }, [])

  const handleSignIn = async (): Promise<void> => {
    setError(null)
    setLoading(true)
    try {
      const u = await window.api.invoke<GoogleUser>('auth:google-start')
      setUser(u)
      onSignIn?.(u)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'access_denied' && msg !== 'TIMEOUT') {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async (): Promise<void> => {
    setShowMenu(false)
    await window.api.invoke('auth:google-logout')
    setUser(null)
  }

  const GoogleIcon = (): JSX.Element => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )

  // ── Signed in ─────────────────────────────────────────────────────────────
  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu((s) => !s)}
          title={collapsed ? `${user.name}\n${user.email}` : undefined}
          className={[
            'flex items-center w-full rounded-[var(--radius-md)] transition-colors duration-150',
            'hover:bg-on-surface/[0.06] text-on-surface-variant hover:text-on-surface',
            collapsed ? 'justify-center h-11' : 'gap-2.5 px-3 h-11',
          ].join(' ')}
        >
          <img
            src={user.picture}
            alt={user.name}
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-full flex-shrink-0 hairline"
          />
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <div className="t-footnote font-semibold truncate text-on-surface">{user.name}</div>
              <div className="t-caption text-on-surface-variant truncate">{user.email}</div>
            </div>
          )}
          {!collapsed && (
            <MoreVertical size={14} className="text-on-surface-variant/40 flex-shrink-0" />
          )}
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="ui-menu absolute bottom-full left-0 mb-1 z-50 w-52">
              {collapsed && (
                <div className="px-2.5 py-1.5 hairline-b mb-1">
                  <div className="t-footnote font-semibold text-on-surface truncate">{user.name}</div>
                  <div className="t-caption text-on-surface-variant truncate">{user.email}</div>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="ui-menu-item w-full"
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Signed out ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-1.5">
      <button
        onClick={handleSignIn}
        disabled={loading}
        title={collapsed ? 'Iniciar sesión con Google' : undefined}
        className={[
          'flex items-center w-full rounded-[var(--radius-md)] transition-colors duration-150',
          'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06]',
          'disabled:opacity-50 disabled:cursor-wait',
          collapsed ? 'justify-center h-11' : 'gap-3 px-1 h-10',
        ].join(' ')}
      >
        {loading
          ? <span className="inline-block w-5 h-5 border-2 border-on-surface/15 border-t-on-surface-variant rounded-full animate-spin flex-shrink-0" />
          : <GoogleIcon />
        }
        {!collapsed && (
          <span className="t-body font-medium truncate">
            {loading ? 'Abriendo el navegador…' : 'Iniciar sesión con Google'}
          </span>
        )}
      </button>

      {error && !collapsed && (
        <p className="t-caption text-error px-1">{error}</p>
      )}
    </div>
  )
}
