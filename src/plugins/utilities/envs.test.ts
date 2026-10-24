import { describe, expect, it } from 'vitest'
import { detectEnv, planChange, readCfg, targetKind, type WigosEnv } from './envs'

const qa: WigosEnv = { id: 'qa', name: 'QA', principal: '13.38.6.166,44058', mirror: '', dbId: '000' }
const cfg = `<SiteConfig>
  <DBPrincipal>35.180.6.182,44058</DBPrincipal>
  <DBMirror>35.180.6.182,44058</DBMirror>
  <DBId>000</DBId>
</SiteConfig>`

describe('ambientes', () => {
  it('tipo de archivo por nombre', () => {
    expect(targetKind('C:\\x\\WigosGUI.cfg')).toBe('cfg')
    expect(targetKind('C:\\x\\Wigos.Auth.csproj.user')).toBe('csproj-user')
    expect(targetKind('C:\\x\\Properties\\launchSettings.json')).toBe('launch-settings')
    expect(targetKind('C:\\x\\app.config')).toBeNull()
  })
  it('.cfg: cambia principal y espejo (el espejo vacío = el principal), DBId igual no cuenta', () => {
    const p = planChange('cfg', cfg, qa)
    expect(p.next).toContain('<DBPrincipal>13.38.6.166,44058</DBPrincipal>')
    expect(p.next).toContain('<DBMirror>13.38.6.166,44058</DBMirror>')
    expect(p.changes.map((c) => c.label)).toEqual(['DBPrincipal', 'DBMirror'])
    expect(planChange('cfg', p.next, qa).changes).toEqual([])
  })
  it('.csproj.user: sólo los argumentos de base, el resto queda igual', () => {
    const t = '<StartArguments>/venueid=12 /dbprincipal_second=1.2.3.4,1433 /dbmirror_second=1.2.3.4,1433 /dbid_second=005 /mode=2</StartArguments>'
    const p = planChange('csproj-user', t, { ...qa, dbId: '001' })
    expect(p.next).toBe('<StartArguments>/venueid=12 /dbprincipal_second=13.38.6.166,44058 /dbmirror_second=13.38.6.166,44058 /dbid_second=001 /mode=2</StartArguments>')
    expect(p.changes).toHaveLength(3)
  })
  it('launchSettings.json: commandLineArgs', () => {
    const t = '{ "profiles": { "x": { "commandLineArgs": "/dbprincipal 1.2.3.4,1433 /dbid 000" } } }'
    const p = planChange('launch-settings', t, qa)
    expect(p.next).toContain('"commandLineArgs": "/dbprincipal 13.38.6.166,44058 /dbid 000"')
    expect(p.changes).toHaveLength(1)
  })
  it('lee el .cfg y reconoce el ambiente puesto', () => {
    const cur = readCfg(cfg)
    expect(cur).toEqual({ principal: '35.180.6.182,44058', mirror: '35.180.6.182,44058', dbId: '000' })
    expect(detectEnv(cur, [qa, { ...qa, id: 'stg', name: 'STG', principal: '35.180.6.182,44058' }])?.name).toBe('STG')
  })
})
