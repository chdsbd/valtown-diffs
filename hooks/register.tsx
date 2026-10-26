import type { Register } from 'claude-code'

const PREFIX = 'mcp__plugin_valtown_valtown__'
const EDIT_TOOLS = new Set([
  'replace_in_file',
  'update_file',
  'create_file',
  'append_to_file',
  'prepend_to_file',
  'insert_at_line',
])

type Line = { kind: string; text: string }
type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: Line[] }
type FileEdit = {
  view: 'file_edit'
  val: string
  path: string
  hunks: Hunk[]
  stats?: { additions: number; deletions: number }
}

const MARKS: Record<string, string> = { add: '+', del: '-', delete: '-', remove: '-', ctx: ' ' }

// MCP output arrives as a string, a content-block array, or { content: [...] }.
function textOf(output: unknown): string | undefined {
  if (typeof output === 'string') return output
  const blocks = Array.isArray(output)
    ? output
    : (output as { content?: unknown } | null)?.content
  if (!Array.isArray(blocks)) return undefined
  return blocks
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('')
}

function parseEdit(output: unknown): FileEdit | undefined {
  const text = textOf(output)
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text)
    return parsed?.view === 'file_edit' && Array.isArray(parsed.hunks) ? parsed : undefined
  } catch {
    return undefined
  }
}

function unified(hunks: Hunk[]): string {
  return hunks
    .map(h =>
      [
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
        ...h.lines.map(l => (MARKS[l.kind] ?? ' ') + l.text),
      ].join('\n'),
    )
    .join('\n')
}

export const register: Register = on => {
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    const { tool, input, output, isErrored } = e.props
    if (!tool.startsWith(PREFIX)) return next(e)

    const name = tool.slice(PREFIX.length)
    const edit = isErrored ? undefined : parseEdit(output)
    if (!edit || edit.hunks.length === 0) {
      // Still running or not a diff: keep the engine's row, but drop the bulky strings.
      if (!EDIT_TOOLS.has(name)) return next(e)
      const { val, path } = (input ?? {}) as { val?: string; path?: string }
      return next({ ...e, props: { ...e.props, input: { val, path } } })
    }

    const { Box, Text, Code } = $.ui.resolve(e)
    const { additions = 0, deletions = 0 } = edit.stats ?? {}

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>valtown {name}</Text>({edit.val}/{edit.path})
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text dimColor>
            ⎿ Added {additions} line{additions === 1 ? '' : 's'}, removed {deletions} line
            {deletions === 1 ? '' : 's'}
          </Text>
          <Box paddingLeft={2}>
            <Code source={unified(edit.hunks)} path={edit.path} format="diff" />
          </Box>
        </Box>
      </Box>
    )
  })
}
