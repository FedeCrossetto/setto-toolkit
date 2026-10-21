import { useEffect, useRef, useState } from 'react'
import { AtSign, Play } from 'lucide-react'
import { Modal } from '../../core/components/Modal'

/**
 * Consultas con parámetros: si el SQL usa @variables sin declarar, antes de ejecutar se
 * piden sus valores (se recuerdan por pestaña). Números van como número, NULL como NULL
 * y el resto como texto.
 */
export interface ParamsRequest {
  names: string[]
  values: Record<string, string>
  resolve: (values: Record<string, string> | null) => void
}

export function ParamsDialog({ request }: { request: ParamsRequest | null }): JSX.Element {
  const [vals, setVals] = useState<Record<string, string>>({})
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!request) return
    setVals(Object.fromEntries(request.names.map((n) => [n, request.values[n] ?? ''])))
    setTimeout(() => { first.current?.focus(); first.current?.select() }, 30)
  }, [request])
  if (!request) return <Modal open={false} onClose={() => undefined} />
  const done = (ok: boolean): void => request.resolve(ok ? vals : null)
  return (
    <Modal open onClose={() => done(false)} width={440}
      title={request.names.length === 1 ? 'Valor del parámetro' : `Valores de ${request.names.length} parámetros`}
      subtitle="Números van como número, NULL como NULL y el resto como texto. Se recuerdan en esta pestaña."
      footer={(
        <>
          <button type="button" className="ui-btn ui-btn-outline" onClick={() => done(false)}>Cancelar</button>
          <button type="button" className="ui-btn-run flex items-center gap-1.5 h-[32px] px-3.5 rounded-[9px] text-[13px]" onClick={() => done(true)}>
            <Play size={13} /> Ejecutar
          </button>
        </>
      )}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); done(true) }}>
        {request.names.map((n, i) => (
          <label key={n} className="flex items-center gap-3">
            <span className="flex items-center gap-1 w-[140px] shrink-0 font-mono text-[12.5px] text-on-surface truncate" title={`@${n}`}>
              <AtSign size={12} className="text-primary shrink-0" />{n}
            </span>
            <input ref={i === 0 ? first : undefined} value={vals[n] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [n]: e.target.value }))}
              spellCheck={false} placeholder="valor, número o NULL" className="ui-input flex-1 h-[32px] font-mono text-[12.5px]" />
          </label>
        ))}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
