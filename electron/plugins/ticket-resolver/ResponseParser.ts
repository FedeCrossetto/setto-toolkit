/**
 * Parses delimited blocks from Claude CLI output.
 *
 * Expected format:
 *   ##BLOCKNAME##
 *   ...content...
 *   ##END##
 *
 * Block names are stored in UPPERCASE.
 * If a block appears more than once, the last occurrence wins.
 */
export function parseBlocks(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const regex = /##([A-Z_]+)##\s*([\s\S]*?)##END##/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    result[match[1]] = match[2].trim()
  }
  return result
}

/**
 * Gets a named block or a fallback string.
 */
export function getBlock(blocks: Record<string, string>, name: string, fallback = ''): string {
  return blocks[name.toUpperCase()] ?? fallback
}

/**
 * Returns true if the output has at least one well-formed block.
 */
export function hasBlocks(text: string): boolean {
  return /##[A-Z_]+##[\s\S]*?##END##/.test(text)
}
