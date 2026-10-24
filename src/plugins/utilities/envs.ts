/**
 * Ambientes de Wigos: cambiar de una vez la IP/base en los .cfg (WigosGUI.cfg, WSI.Cashier.cfg…)
 * y en los argumentos de inicio de Visual Studio (/dbprincipal_second, /dbid…).
 * Sólo se tocan valores concretos (etiquetas y argumentos conocidos), nunca "toda IP que aparezca".
 * Funciones puras: el leer/escribir archivos está en electron/plugins/envs.
 */
export interface WigosEnv {
  id: string
  name: string
  /** "IP,puerto" o "SERVIDOR\\INSTANCIA" */
  principal: string
  /** Vacío: el mismo que el principal */
  mirror: string
  /** Vacío: no se cambia */
  dbId: string
}

export type TargetKind = 'cfg' | 'csproj-user' | 'launch-settings'
export interface EnvTarget { path: string; kind: TargetKind }
export interface EnvChange { label: string; from: string; to: string }
export interface EnvPlan { next: string; changes: EnvChange[] }

export function targetKind(path: string): TargetKind | null {
  const p = path.toLowerCase()
  if (p.endsWith('.cfg')) return 'cfg'
  if (p.endsWith('.csproj.user') || p.endsWith('.vbproj.user')) return 'csproj-user'
  if (p.endsWith('launchsettings.json')) return 'launch-settings'
  return null
}

const mirrorOf = (e: WigosEnv): string => e.mirror.trim() || e.principal.trim()

/** <Tag>valor</Tag> (sin distinguir mayúsculas). */
function replaceTag(text: string, tag: string, value: string, changes: EnvChange[]): string {
  const re = new RegExp(`(<${tag}>)([^<]*)(</${tag}>)`, 'gi')
  return text.replace(re, (m, open: string, cur: string, close: string) => {
    if (cur.trim() === value) return m
    changes.push({ label: tag, from: cur.trim(), to: value })
    return `${open}${value}${close}`
  })
}

/** /flag=valor, /flag:valor o /flag valor (también _second). */
function replaceArg(args: string, flag: RegExp, value: string, changes: EnvChange[]): string {
  return args.replace(new RegExp(`(/${flag.source}(?:_second)?)([=: ]+)("[^"]*"|[^\\s"]+)`, 'gi'), (m, name: string, sep: string, cur: string) => {
    const curVal = cur.replace(/^"|"$/g, '')
    if (curVal === value) return m
    changes.push({ label: `${name}`, from: curVal, to: value })
    return `${name}${sep}${/\s/.test(value) ? `"${value}"` : value}`
  })
}

function replaceArgs(args: string, env: WigosEnv, changes: EnvChange[]): string {
  let a = replaceArg(args, /dbprincipal/, env.principal.trim(), changes)
  a = replaceArg(a, /dbmirror/, mirrorOf(env), changes)
  if (env.dbId.trim()) a = replaceArg(a, /dbid/, env.dbId.trim(), changes)
  return a
}

/** Qué cambia en un archivo al aplicar el ambiente (y el texto resultante). */
export function planChange(kind: TargetKind, text: string, env: WigosEnv): EnvPlan {
  const changes: EnvChange[] = []
  let next = text
  if (kind === 'cfg') {
    next = replaceTag(next, 'DBPrincipal', env.principal.trim(), changes)
    next = replaceTag(next, 'DBMirror', mirrorOf(env), changes)
    if (env.dbId.trim()) next = replaceTag(next, 'DBId', env.dbId.trim(), changes)
  } else if (kind === 'csproj-user') {
    next = next.replace(/(<StartArguments>)([^<]*)(<\/StartArguments>)/gi, (_m, o: string, args: string, c: string) => `${o}${replaceArgs(args, env, changes)}${c}`)
  } else {
    // "commandLineArgs": "..." (JSON; las comillas internas vienen escapadas)
    next = next.replace(/("commandLineArgs"\s*:\s*")((?:[^"\\]|\\.)*)(")/g, (_m, o: string, args: string, c: string) => `${o}${replaceArgs(args, env, changes)}${c}`)
  }
  return { next, changes }
}

/** Valores actuales de un .cfg (para "guardar el actual como ambiente" y saber cuál está puesto). */
export function readCfg(text: string): { principal: string; mirror: string; dbId: string } | null {
  const get = (tag: string): string => new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(text)?.[1]?.trim() ?? ''
  const principal = get('DBPrincipal')
  return principal ? { principal, mirror: get('DBMirror'), dbId: get('DBId') } : null
}

/** El ambiente cuyo principal (y base, si la tiene) coincide con lo que hay en el archivo. */
export function detectEnv(current: { principal: string; dbId: string } | null, envs: WigosEnv[]): WigosEnv | null {
  if (!current) return null
  return envs.find((e) => e.principal.trim() === current.principal && (!e.dbId.trim() || e.dbId.trim() === current.dbId)) ?? null
}
