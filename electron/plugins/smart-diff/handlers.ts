import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'

export const handlers: PluginHandlers = {
  pluginId: 'smart-diff',

  register(ipcMain: IpcMain, { ai }: CoreServices): void {
    ipcMain.handle('smart-diff:analyze', async (_event, { original, modified }: { original: string; modified: string }) => {
      const messages = [
        {
          role: 'system' as const,
          content:
            'You are a code analysis assistant. Analyze the semantic differences between two code snippets. Be concise and technical. Respond ONLY with valid JSON.'
        },
        {
          role: 'user' as const,
          content: `Analyze the semantic differences between these two code snippets and respond with JSON in this exact format:
{
  "primaryChange": "one sentence describing the main conceptual change",
  "sideEffects": "one sentence describing potential breaking changes or side effects",
  "recommendation": "one sentence with a concrete improvement suggestion"
}

ORIGINAL:
\`\`\`
${original}
\`\`\`

MODIFIED:
\`\`\`
${modified}
\`\`\``
        }
      ]

      const result = await ai.complete(messages)

      let parsed: { primaryChange: string; sideEffects: string; recommendation: string }
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/)
        parsed = JSON.parse(jsonMatch?.[0] ?? result.text)
      } catch {
        parsed = {
          primaryChange: result.text,
          sideEffects: 'Unable to parse structured response.',
          recommendation: 'Review the changes manually.'
        }
      }

      return { ...parsed, cached: result.cached }
    })
  }
}
