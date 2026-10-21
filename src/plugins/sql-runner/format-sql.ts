/**
 * Formateador de T-SQL simple y predecible (sin dependencias): palabras clave en
 * mayúsculas, cada cláusula en su línea, columnas y condiciones AND/OR indentadas,
 * subconsultas con sangría. Respeta textos, comentarios, [identificadores] y los GO.
 */

const KEYWORDS = new Set(`
ADD ALL ALTER AND ANY AS ASC BEGIN BETWEEN BY CASE CAST CHECK CLOSE COLLATE COLUMN COMMIT CONSTRAINT CONVERT CREATE CROSS
CURSOR DATABASE DEALLOCATE DECLARE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXCEPT EXEC EXECUTE EXISTS FETCH FOR FOREIGN
FROM FULL FUNCTION GOTO GRANT GROUP HAVING IDENTITY IF IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LEFT LIKE MERGE
NOCOUNT NOLOCK NOT NULL OF OFF ON OPEN OR ORDER OUTER OUTPUT OVER PARTITION PERCENT PRIMARY PRINT PROC PROCEDURE RAISERROR
REFERENCES RETURN RETURNS RIGHT ROLLBACK ROWCOUNT SELECT SET TABLE THEN THROW TIES TOP TRAN TRANSACTION TRIGGER TRUNCATE
TRY CATCH UNION UNIQUE UPDATE USE USING VALUES VIEW WHEN WHERE WHILE WITH APPLY PIVOT UNPIVOT MATCHED TARGET SOURCE
COUNT SUM MIN MAX AVG ISNULL COALESCE GETDATE DATEADD DATEDIFF NULLIF IIF LEN LTRIM RTRIM UPPER LOWER SUBSTRING REPLACE ROW_NUMBER
`.trim().split(/\s+/))

/** Cláusulas que van en su propia línea (al nivel de la sentencia). */
const CLAUSES = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION ALL', 'UNION', 'EXCEPT', 'INTERSECT',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'DELETE', 'OUTPUT', 'MERGE', 'USING', 'WHEN MATCHED', 'WHEN NOT MATCHED',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'INNER JOIN', 'CROSS JOIN',
  'CROSS APPLY', 'OUTER APPLY', 'JOIN', 'DECLARE', 'EXEC', 'EXECUTE', 'USE', 'BEGIN', 'END', 'IF', 'ELSE', 'WHILE', 'RETURN', 'PRINT', 'WITH',
]
/** Después de estas, cada coma corta línea (listas de columnas o asignaciones). */
const LIST_CLAUSES = new Set(['SELECT', 'GROUP BY', 'ORDER BY', 'SET', 'OUTPUT'])
/** En estas el primer elemento también baja de línea (en ORDER BY / GROUP BY queda al lado). */
const BREAK_FIRST = new Set(['SELECT', 'SET', 'OUTPUT'])
const CONDITION_CLAUSES = new Set(['WHERE', 'HAVING', 'ON', 'WHEN MATCHED', 'WHEN NOT MATCHED'])

type Tok = { t: 'ws' | 'nl' | 'comment' | 'lcomment' | 'str' | 'ident' | 'word' | 'num' | 'punct'; v: string }

export function tokenize(sql: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]!
    const rest = sql.slice(i)
    let m: RegExpMatchArray | null
    if (c === '\n') { out.push({ t: 'nl', v: '\n' }); i++; continue }
    if ((m = rest.match(/^[ \t\r]+/))) { out.push({ t: 'ws', v: m[0] }); i += m[0].length; continue }
    if (rest.startsWith('--')) { const e = sql.indexOf('\n', i); const v = e < 0 ? sql.slice(i) : sql.slice(i, e); out.push({ t: 'lcomment', v: v.trimEnd() }); i += v.length; continue }
    if (rest.startsWith('/*')) { const e = sql.indexOf('*/', i + 2); const v = e < 0 ? sql.slice(i) : sql.slice(i, e + 2); out.push({ t: 'comment', v }); i += v.length; continue }
    if ((m = rest.match(/^N?'(?:[^']|'')*'?/i)) && (c === "'" || ((c === 'N' || c === 'n') && sql[i + 1] === "'"))) { out.push({ t: 'str', v: m[0] }); i += m[0].length; continue }
    if (c === '[') { const e = sql.indexOf(']', i); const v = e < 0 ? sql.slice(i) : sql.slice(i, e + 1); out.push({ t: 'ident', v }); i += v.length; continue }
    if (c === '"') { const e = sql.indexOf('"', i + 1); const v = e < 0 ? sql.slice(i) : sql.slice(i, e + 1); out.push({ t: 'ident', v }); i += v.length; continue }
    if ((m = rest.match(/^(?:0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i))) { out.push({ t: 'num', v: m[0] }); i += m[0].length; continue }
    if ((m = rest.match(/^[@#]{0,2}[\p{L}_][\p{L}\p{N}_@$#]*/u))) { out.push({ t: 'word', v: m[0] }); i += m[0].length; continue }
    if ((m = rest.match(/^(?:<>|!=|>=|<=|\+=|-=|\*=|\/=|::|[(),;.=<>+\-*/%&|^~!])/))) { out.push({ t: 'punct', v: m[0] }); i += m[0].length; continue }
    out.push({ t: 'punct', v: c }); i++
  }
  return out
}

/** Formatea un lote (sin GO). */
function formatBatch(sql: string, indentUnit: string): string {
  const toks = tokenize(sql).filter((t) => t.t !== 'ws')
  const lines: string[] = []
  let line = ''
  /** pila de contextos de paréntesis: true = subconsulta (indenta) */
  const parens: { sub: boolean; base: number; lvl: number; clause: string }[] = []
  let base = 0
  let clause = ''
  let pendingBreak = false
  let caseDepth = 0
  const indent = (k: number): string => indentUnit.repeat(Math.max(0, k))
  /** Recién empezada una lista (SELECT, SET…): el primer elemento va en la línea de abajo. */
  const startList = (): void => { if (BREAK_FIRST.has(clause) && line.trim() === clause) newline(base + 1) }
  const flush = (): void => { if (line.trim()) lines.push(line.replace(/\s+$/, '')); line = '' }
  const newline = (k: number): void => { flush(); line = indent(k) }
  const push = (v: string, space = true): void => {
    if (!line.trim()) { line += v; return }
    const last = line[line.length - 1]
    line += (space && last !== '(' && last !== '.' && last !== ' ' ? ' ' : '') + v
  }

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i]!
    if (tok.t === 'nl') { continue }
    if (tok.t === 'lcomment') { push(tok.v); pendingBreak = true; continue }
    if (tok.t === 'comment') { if (line.trim()) push(tok.v); else { newline(base); line += tok.v } if (tok.v.includes('\n')) pendingBreak = true; continue }
    if (pendingBreak) { newline(base + (clause ? 1 : 0)); pendingBreak = false }

    if (tok.t === 'word') {
      const up = tok.v.toUpperCase()
      // cláusulas de varias palabras (GROUP BY, LEFT OUTER JOIN…)
      const words: string[] = [up]
      for (let j = i + 1; j < toks.length && words.length < 3; j++) {
        if (toks[j]!.t === 'nl') continue
        if (toks[j]!.t !== 'word') break
        words.push(toks[j]!.v.toUpperCase())
      }
      const multi = CLAUSES.find((c) => { const parts = c.split(' '); return parts.every((p, k) => words[k] === p) })
      if (multi && caseDepth === 0 && !(up === 'END' && caseDepth > 0) && !(multi === 'SET' && clause === 'UPDATE' && false)) {
        const parts = multi.split(' ').length
        for (let k = 1, j = i + 1; k < parts; j++) { if (toks[j]!.t === 'word') { k++; i = j } }
        const inParen = parens.length && !parens[parens.length - 1]!.sub
        if (!inParen) { newline(base); clause = multi }
        else push(multi)
        if (!inParen) line += multi
        continue
      }
      if (up === 'CASE') caseDepth++
      if (up === 'END' && caseDepth > 0) caseDepth--
      if ((up === 'AND' || up === 'OR') && (CONDITION_CLAUSES.has(clause) || clause.endsWith('JOIN')) && caseDepth === 0 && !(parens.length && !parens[parens.length - 1]!.sub)) {
        // BETWEEN x AND y no corta
        const prev = lines.length || line ? line.toUpperCase() : ''
        if (up === 'AND' && /\bBETWEEN\s+\S+$/.test(prev)) { push(up); continue }
        newline(base + 1); line += up; continue
      }
      if (up === 'ON' && clause.endsWith('JOIN')) { newline(base + 1); line += 'ON'; continue }
      startList()
      push(KEYWORDS.has(up) ? up : tok.v)
      continue
    }

    if (tok.t === 'punct') {
      const v = tok.v
      if (v === '(' || v === '*' || v === '@') startList()
      if (v === '(') {
        // ¿subconsulta?
        let j = i + 1
        while (j < toks.length && toks[j]!.t === 'nl') j++
        const sub = toks[j]?.t === 'word' && /^(select|with)$/i.test(toks[j]!.v)
        const spaced = !/[\w\]]$/.test(line) || /\b(IN|EXISTS|FROM|JOIN|AS|AND|OR|ON|WHERE|NOT|VALUES)$/i.test(line.trimEnd())
          || ((clause === 'INSERT INTO' || clause === 'VALUES') && !parens.length)
        push('(', spaced)
        // La subconsulta se indenta respecto de la línea donde abre (p. ej. "    AND x IN (").
        const lvl = Math.floor((line.length - line.trimStart().length) / indentUnit.length)
        parens.push({ sub, base, lvl, clause })
        if (sub) { base = lvl + 1; clause = '' }
        continue
      }
      if (v === ')') {
        const p = parens.pop()
        if (p?.sub) { base = p.base; clause = p.clause; newline(p.lvl); line += ')' } else line += ')'
        continue
      }
      if (v === ',') {
        line += ','
        if (LIST_CLAUSES.has(clause) && !(parens.length && !parens[parens.length - 1]!.sub) && caseDepth === 0) newline(base + 1)
        continue
      }
      if (v === ';') { line += ';'; flush(); if (lines[lines.length - 1] !== '') lines.push(''); clause = ''; base = 0; parens.length = 0; continue }
      if (v === '.') { line = line.replace(/\s+$/, '') + '.'; continue }
      if (/^[=<>!+\-*/%]=?$|^<>$/.test(v)) { push(v); continue }
      push(v)
      continue
    }
    // str, ident, num
    const last = line[line.length - 1]
    if (last === '.') line += tok.v
    else { startList(); push(tok.v) }
  }
  flush()
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop()
  return lines.join('\n')
}

/** Formatea T-SQL; los GO se respetan (cada lote se formatea por separado). */
export function formatSql(sql: string, indentUnit = '    '): string {
  const parts = sql.split(/^\s*(GO(?:\s+\d+)?)\s*$/im)
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    if (i % 2 === 1) { out.push(p.trim().toUpperCase()); continue }
    if (p.trim()) out.push(formatBatch(p, indentUnit))
  }
  return out.join('\n') + (sql.endsWith('\n') ? '\n' : '')
}
