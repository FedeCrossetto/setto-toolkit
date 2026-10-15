import { describe, expect, it } from 'vitest'
import { classifyContext, isSqlSnippet } from './context'

describe('classifyContext', () => {
  it('SSMS y otros clientes SQL', () => {
    expect(classifyContext('Ssms', 'SQLQuery1.sql - CROSSETTO\\MSSQLSERVER02.wgdb_000 (sa (61))')).toEqual({ kind: 'sql', label: 'SSMS' })
    expect(classifyContext('dbeaver', 'DBeaver')?.kind).toBe('sql')
  })
  it('editores de código', () => {
    expect(classifyContext('devenv', 'WSI.CommonA - Microsoft Visual Studio')).toEqual({ kind: 'code', label: 'Visual Studio' })
    expect(classifyContext('Code.exe', 'dock.ts - mytools-app')?.label).toBe('VS Code')
  })
  it('un ticket en el título gana (Jira en el navegador)', () => {
    expect(classifyContext('msedge', '[WIGOS-133000] Duplicado de documento - Jira - Microsoft Edge')).toEqual({ kind: 'ticket', label: 'WIGOS-133000', ticket: 'WIGOS-133000' })
  })
  it('chat y correo', () => {
    expect(classifyContext('ms-teams', 'Chat | Microsoft Teams')?.kind).toBe('chat')
  })
  it('nada para apps sin sugerencias', () => {
    expect(classifyContext('explorer', 'Descargas')).toBeNull()
    expect(classifyContext('', '')).toBeNull()
  })
})

describe('isSqlSnippet', () => {
  it('por lenguaje, etiqueta o contenido', () => {
    expect(isSqlSnippet({ language: 'sql' })).toBe(true)
    expect(isSqlSnippet({ language: 'text', tags: ['SQL'] })).toBe(true)
    expect(isSqlSnippet({ language: 'text', content: '  SELECT * FROM accounts' })).toBe(true)
    expect(isSqlSnippet({ language: 'powershell', content: 'Get-Process' })).toBe(false)
  })
})
