import { useEffect, useState } from 'react'
import { Bell, ClipboardText, Code2, Monitor, PanelLeft } from 'lucide-react'
import { SettingsGroup, SettingsRow, Toggle } from '../../core/components/Form'
import { useToast } from '../../core/components/Toast'
import { NOTIFICATIONS_SETTING, notify } from '../../core/notify'

/**
 * Ajustes → Escritorio: notificaciones del sistema, seguir en la bandeja al
 * cerrar y el atajo global de snippets. Valores '1'/'0' en settings (main).
 */
type Flag = 'app.close_to_tray' | typeof NOTIFICATIONS_SETTING | 'snippets.auto_paste' | 'app.clipboard_history' | 'app.dock'
/** Valor cuando la clave todavía no existe. */
const DEFAULTS: Record<Flag, boolean> = {
  'app.close_to_tray': false,
  [NOTIFICATIONS_SETTING]: true,
  'snippets.auto_paste': true,
  'app.clipboard_history': true,
  'app.dock': true,
}

export function DesktopSettings(): JSX.Element {
  const toast = useToast()
  const [flags, setFlags] = useState<Record<Flag, boolean>>(DEFAULTS)
  const [shortcut, setShortcut] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const next = { ...DEFAULTS }
      for (const k of Object.keys(DEFAULTS) as Flag[]) {
        try {
          const v = await window.api.invoke<string | null>('settings:get', k)
          if (v === '1' || v === '0') next[k] = v === '1'
        } catch { /* default */ }
      }
      setFlags(next)
      try { setShortcut(await window.api.invoke<string | null>('snippet-picker:shortcut')) } catch { /* sin atajo */ }
    })()
  }, [])

  const set = (k: Flag, v: boolean): void => {
    setFlags((f) => ({ ...f, [k]: v }))
    void window.api.invoke('settings:set', k, v ? '1' : '0').catch(() => toast.show('No se pudo guardar el ajuste', 'error'))
    if (k === 'app.clipboard_history') void window.api.invoke('clipboard:set-enabled', v).catch(() => undefined)
    if (k === 'app.dock') void window.api.invoke('dock:set-enabled', v).catch(() => undefined)
  }

  const testNotification = async (): Promise<void> => {
    const ok = await notify('Así se ven los avisos de Setto', 'Vencimientos de Gastos y recordatorios de Notas.', { pluginId: 'settings' })
    if (!ok) toast.show(flags[NOTIFICATIONS_SETTING] ? 'El sistema no permitió mostrar la notificación' : 'Las notificaciones están desactivadas', 'error')
  }

  return (
    <SettingsGroup id="ajustes-escritorio" title="Escritorio" description="Avisos del sistema, bandeja y atajos globales.">
      <SettingsRow icon={Bell} title="Notificaciones" description="Vencimientos de servicios en Gastos y recordatorios de Notas.">
        <div className="flex items-center gap-2.5">
          <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => void testNotification()}>Probar</button>
          <Toggle checked={flags[NOTIFICATIONS_SETTING]} onChange={(v) => set(NOTIFICATIONS_SETTING, v)} label="Notificaciones del sistema" />
        </div>
      </SettingsRow>
      <SettingsRow icon={Monitor} title="Al cerrar, seguir en la bandeja" description="La X oculta la ventana: los avisos y atajos siguen andando. Salís desde el ícono de la bandeja.">
        <Toggle checked={flags['app.close_to_tray']} onChange={(v) => set('app.close_to_tray', v)} label="Seguir en la bandeja al cerrar" />
      </SettingsRow>
      <SettingsRow
        icon={Code2}
        title="Portapapeles y snippets desde cualquier app"
        description={shortcut
          ? <>Con <kbd className="font-sans font-medium">{shortcut}</kbd> elegís algo copiado, una captura o un snippet y se pega donde estabas escribiendo (→ lo transforma antes). Ctrl+Alt+T copia el texto de un recorte.</>
          : 'No se pudo registrar el atajo global (lo usa otra app).'}
      >
        <label className="flex items-center gap-2 t-footnote text-on-surface-variant">
          Pegar automáticamente
          <Toggle checked={flags['snippets.auto_paste']} onChange={(v) => set('snippets.auto_paste', v)} label="Pegar automáticamente" />
        </label>
      </SettingsRow>
      <SettingsRow icon={ClipboardText} title="Historial del portapapeles" description="Lo último que copiaste, en Portapapeles → Texto y en Ctrl+K. Guarda los últimos 20 y los fijados (cifrados); nunca contraseñas.">
        <Toggle checked={flags['app.clipboard_history']} onChange={(v) => set('app.clipboard_history', v)} label="Historial del portapapeles" />
      </SettingsRow>
      <SettingsRow icon={PanelLeft} title="Barra flotante a la derecha"
        description="Pestaña con el logo en el borde derecho (arrastrala para moverla): al pasar el mouse (o Ctrl+Alt+D) muestra lo copiado, capturas, snippets y accesos. Se esconde en pantalla completa.">
        <Toggle checked={flags['app.dock']} onChange={(v) => set('app.dock', v)} label="Barra flotante a la derecha" />
      </SettingsRow>
    </SettingsGroup>
  )
}
