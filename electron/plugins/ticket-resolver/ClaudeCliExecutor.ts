import { spawn } from 'child_process'

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
}

/**
 * Runs `<command> --print` with the given prompt written to stdin.
 * Defaults to 'claude' (Claude Code CLI).
 *
 * `command` can be overridden via settings (ticket-resolver.claude_path)
 * to support non-standard install paths, e.g. 'C:\\tools\\claude.exe'.
 */
export async function runClaudeCli(
  prompt: string,
  timeoutMs = 120_000,
  command = 'claude',
): Promise<CliResult> {
  const t0 = Date.now()

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const proc = spawn(command, ['--print'], {
      shell: true,
      windowsHide: true,
    })

    const settle = (exitCode: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode, timedOut, durationMs: Date.now() - t0 })
    }

    const timer = setTimeout(() => {
      timedOut = true
      try { proc.kill('SIGTERM') } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 3000)
      settle(null)
    }, timeoutMs)

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    proc.on('close', (code) => settle(code))
    proc.on('error', (err) => {
      const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
      const msg = isNotFound
        ? `"${command}" not found — install Claude Code and ensure it is in your PATH, or set the path in Configuración`
        : `Failed to spawn "${command}": ${err.message}`
      stderr += `\n[executor] ${msg}`
      settle(null)
    })

    try {
      proc.stdin!.write(prompt, 'utf8', () => { proc.stdin!.end() })
    } catch (err) {
      stderr += `\n[stdin] ${(err as Error).message}`
      settle(null)
    }
  })
}
