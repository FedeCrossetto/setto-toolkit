import type { JiraTicket, CodeSnippet } from '../../../src/plugins/ticket-resolver/types'
import { formatSnippetsForPrompt } from './ContextCompressor'

const BLOCK_FORMAT = `
IMPORTANTE: Responde usando EXACTAMENTE este formato de bloques. Cada bloque:
  ##NOMBRE##
  contenido
  ##END##
No uses markdown, no uses \`\`\`, no uses # para encabezados. Solo texto plano dentro de los bloques.
`.trim()

// ── Stage 1: Analysis ────────────────────────────────────────────────────────

/**
 * Builds the analysis prompt (Stage 1).
 * Claude outputs: ANALYSIS, ROOTCAUSE, APPROACH, COMPLEXITY, RISKS
 */
export function buildAnalysisPrompt(ticket: JiraTicket, snippets: CodeSnippet[]): string {
  const codeCtx = formatSnippetsForPrompt(snippets)

  return `Eres un desarrollador senior analizando un bug en WinSystems, software financiero empresarial.
Responde SIEMPRE en español. Ningún texto en inglés.

${BLOCK_FORMAT}

TICKET: ${ticket.key} — ${ticket.summary}
TIPO: ${ticket.type} | PRIORIDAD: ${ticket.priority} | ESTADO: ${ticket.status}
COMPONENTES: ${ticket.components.join(', ') || 'No especificado'}
DESCRIPCIÓN:
${ticket.description.slice(0, 800)}

CÓDIGO RELEVANTE DEL REPOSITORIO:
${codeCtx}

Responde con los siguientes bloques:

##ANALYSIS##
Descripción completa del problema: qué está fallando y por qué, basado en el ticket y el código.
##END##

##ROOTCAUSE##
Causa raíz técnica más probable del problema.
##END##

##APPROACH##
Enfoque de solución recomendado con pasos concretos.
##END##

##COMPLEXITY##
Estimación de complejidad: BAJA / MEDIA / ALTA, con justificación en una oración.
##END##

##RISKS##
Riesgos o efectos secundarios a considerar al aplicar la solución.
##END##`
}

// ── Stage 2: Implementation Plan ─────────────────────────────────────────────

/**
 * Builds the implementation plan prompt (Stage 2).
 * Only sends ticket header + analysis summary (not full snippets again) to save tokens.
 * Claude outputs: PLAN, FILES, TESTS, JIRACOMMENT
 */
export function buildPlanPrompt(
  ticket: JiraTicket,
  snippets: CodeSnippet[],
  analysis: { rootCause: string; approach: string },
  userNotes: string,
): string {
  // Stage 2 only resends 2 snippets (most relevant) to save tokens
  const codeCtx = formatSnippetsForPrompt(snippets.slice(0, 2))

  return `Eres un desarrollador senior generando el plan de implementación para WinSystems.
Responde SIEMPRE en español.

${BLOCK_FORMAT}

TICKET: ${ticket.key} — ${ticket.summary}
COMPONENTES: ${ticket.components.join(', ') || 'No especificado'}

CAUSA RAÍZ (del análisis):
${analysis.rootCause}

ENFOQUE PROPUESTO (del análisis):
${analysis.approach}

NOTAS / DECISIÓN DEL DESARROLLADOR:
${userNotes.trim() || 'Proceder con el enfoque propuesto.'}

CÓDIGO DE REFERENCIA (archivos más relevantes):
${codeCtx}

Genera el plan de implementación con estos bloques:

##PLAN##
Plan paso a paso con los cambios de código necesarios.
Para cada cambio: indica el archivo, qué línea/función modificar y el código nuevo o diff.
##END##

##FILES##
Lista de archivos a modificar (uno por línea, con ruta relativa al repositorio).
##END##

##TESTS##
Cómo verificar que el fix funciona: casos de prueba concretos y pasos de validación.
##END##

##JIRACOMMENT##
Comentario listo para pegar en Jira con:
- Causa del error
- Solución implementada
- Cómo probarlo
Redacción profesional, sin tecnicismos innecesarios.
##END##`
}
