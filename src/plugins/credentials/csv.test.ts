import { describe, it, expect } from 'vitest'
import { credentialsToCsv, duplicateKey, markDuplicates, parseCredentialsCsv, parseCsv } from './csv'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, newlines, CRLF and BOM', () => {
    const t = '﻿a,b,c\r\n"x, y","say ""hi""","multi\nline"\r\n1,2,3'
    expect(parseCsv(t)).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'multi\nline'], ['1', '2', '3']])
  })
  it('detects ";" as delimiter', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseCredentialsCsv', () => {
  it('Chrome / Edge', () => {
    const r = parseCredentialsCsv('name,url,username,password,note\ngithub.com,https://github.com/login,fede,s3cr3t,mi nota\n')
    expect(r.format).toBe('chrome')
    expect(r.rows).toEqual([{ nombre: 'github.com', url: 'https://github.com/login', usuario: 'fede', password: 's3cr3t', notas: 'mi nota', categoria: undefined }])
  })
  it('Bitwarden: skips non-login items and maps folder', () => {
    const csv = [
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
      'Trabajo,1,login,Jira,,,0,https://jira.example.com,f.vazquez,pw1,',
      ',,note,Nota segura,texto,,0,,,,',
    ].join('\n')
    const r = parseCredentialsCsv(csv)
    expect(r.format).toBe('bitwarden')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ nombre: 'Jira', usuario: 'f.vazquez', password: 'pw1', categoria: 'Trabajo', url: 'https://jira.example.com' })
    expect(r.skipped).toBe(1)
  })
  it('1Password', () => {
    const r = parseCredentialsCsv('Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\nBanco,https://banco.com,fede,pw2,,false,false,,cuenta 123\n')
    expect(r.format).toBe('1password')
    expect(r.rows[0]).toMatchObject({ nombre: 'Banco', usuario: 'fede', password: 'pw2', notas: 'cuenta 123' })
  })
  it('Firefox: no name column, host is used as name', () => {
    const header = '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"'
    const row = '"https://www.mail.com","yo","pw3",,"https://www.mail.com","{1}","1","1","1"'
    const r = parseCredentialsCsv(`${header}\n${row}\n`)
    expect(r.format).toBe('firefox')
    expect(r.rows[0]).toMatchObject({ nombre: 'mail.com', usuario: 'yo', password: 'pw3' })
  })
  it('errors without a password column and skips empty rows', () => {
    expect(parseCredentialsCsv('name,url\nx,y').error).toBeTruthy()
    expect(parseCredentialsCsv('').error).toBeTruthy()
    const r = parseCredentialsCsv('name,username,password\nVacío,,\nOk,u,p')
    expect(r.rows.map((x) => x.nombre)).toEqual(['Ok'])
    expect(r.skipped).toBe(1)
  })
  it('skips over-long passwords instead of truncating them', () => {
    const r = parseCredentialsCsv(`name,username,password\nx,u,${'a'.repeat(600)}`)
    expect(r.rows).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })
})

describe('duplicates', () => {
  it('same host + user (case/www-insensitive) is a duplicate, also within the file', () => {
    expect(duplicateKey({ nombre: 'X', usuario: 'Fede', url: 'https://www.GitHub.com/login' }))
      .toBe(duplicateKey({ nombre: 'GitHub', usuario: 'fede', url: 'github.com' }))
    const existing = [{ nombre: 'GitHub', usuario: 'fede', url: 'https://github.com' }]
    const rows = [
      { nombre: 'github.com', usuario: 'fede', url: 'https://github.com/login' },
      { nombre: 'Banco', usuario: 'yo' },
      { nombre: 'banco', usuario: 'YO' },
      { nombre: 'github.com', usuario: 'otro', url: 'https://github.com' },
    ]
    expect(markDuplicates(rows, existing)).toEqual([true, false, true, false])
  })
})

describe('credentialsToCsv', () => {
  it('round-trips through the parser (Chrome format), password untouched', () => {
    const items = [
      { nombre: 'A, "b"', url: 'https://a.com', usuario: 'u', password: '=1+2,"x"', notas: 'línea 1\nlínea 2' },
      { nombre: '=cmd', usuario: 'v', password: '-p' },
    ]
    const csv = credentialsToCsv(items)
    expect(csv.startsWith('name,url,username,password,note\r\n')).toBe(true)
    const back = parseCredentialsCsv(csv)
    expect(back.rows[0]).toMatchObject({ nombre: 'A, "b"', usuario: 'u', password: '=1+2,"x"', notas: 'línea 1\nlínea 2' })
    // A formula in a descriptive field is neutralised; the password is not.
    expect(back.rows[1]).toMatchObject({ nombre: "'=cmd", password: '-p' })
  })
})
