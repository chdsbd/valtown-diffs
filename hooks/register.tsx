import type { Register, RenderChildren } from 'claude-code'

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
  runResult?: any
}

type SqlResult = { columns?: string[]; rows?: unknown[]; rowsAffected?: number }

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

// Some results are wrapped in an untrusted-output block, so parse from the first brace to the last.
function parseJson(output: unknown): any {
  const text = textOf(output)
  if (!text) return undefined
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    return undefined
  }
}

// read_file numbers each line as "  12|code".
function stripLineNumbers(content: string): { source: string; startLine?: number } {
  const lines = content.replace(/\n$/, '').split('\n')
  const numbered = lines.map(l => /^\s*(\d+)\|(.*)$/.exec(l))
  if (!numbered.every(Boolean)) return { source: content }
  return { source: numbered.map(m => m![2]).join('\n'), startLine: Number(numbered[0]![1]) }
}

const COMPACT_ROWS = 10

// Local wall-clock time, HH:MM:SS.
const clock = (iso: string) => new Date(iso).toTimeString().slice(0, 8)

function size(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const isErrorLevel = (level: string) => level === 'stderr' || level === 'error'

function bodyLanguage(contentType: string | undefined): string | undefined {
  const type = contentType?.split(';')[0]?.trim() ?? ''
  if (type.endsWith('json')) return 'json'
  if (type.endsWith('html')) return 'html'
  if (type.endsWith('javascript')) return 'javascript'
  if (type.endsWith('css')) return 'css'
  if (type.endsWith('xml')) return 'xml'
  return undefined
}

function pretty(body: string, language: string | undefined): string {
  if (language !== 'json') return body
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`

// Local date and time, YYYY-MM-DD HH:MM.
function when(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// The fields a generic list item is labelled by, in order of preference.
const LABELS = ['identifier', 'key', 'handle', 'name', 'tag', 'publicId', 'id']

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function markdownTable(columns: string[], rows: unknown[]): string {
  const values = (r: unknown) => (Array.isArray(r) ? r : columns.map(c => (r as Record<string, unknown>)[c]))
  return [
    `| ${columns.map(cell).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${values(r).map(cell).join(' | ')} |`),
  ].join('\n')
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

type ListSpec = {
  items: string
  noun: string
  nouns?: string
  target?: (args: Record<string, any>, result: any) => string
  line: (item: any, Text: any) => RenderChildren
}

const described = (Text: any, label: string, detail: unknown) => (
  <Text>
    {label}
    {detail ? <Text dimColor> {String(detail)}</Text> : ''}
  </Text>
)

const LISTS: Record<string, ListSpec> = {
  list_vals: {
    items: 'vals',
    noun: 'val',
    target: (args, r) => args.handle ?? r.user?.handle ?? '',
    line: (v, Text) => described(Text, v.identifier, v.description),
  },
  get_val_history: {
    items: 'history',
    noun: 'version',
    target: (args, r) => `${r.val ?? args.val}@${r.branch ?? args.branch ?? 'main'}`,
    // Not `h`, which would shadow the JSX factory.
    line: (c, Text) => (
      <Text>
        <Text dimColor>
          v{c.version} {when(c.createdAt)}{' '}
        </Text>
        {c.user?.handle}{' '}
        {c.file?.name ?? (c.merge ? 'merge' : c.revert ? 'revert' : c.pull ? 'pull request' : c.multiple ? 'several files' : '')}
      </Text>
    ),
  },
  list_branches: {
    items: 'branches',
    noun: 'branch',
    nouns: 'branches',
    line: (b, Text) => described(Text, b.name, `v${b.version}, updated ${when(b.updatedAt ?? b.createdAt)}`),
  },
  list_env_vars: {
    items: 'environmentVariables',
    noun: 'env var',
    line: (v, Text) => described(Text, v.key, [v.isEmpty && '(empty)', v.description].filter(Boolean).join(' ')),
  },
  find_templates: {
    items: 'templates',
    noun: 'template',
    line: (t, Text) => described(Text, t.identifier, t.description),
  },
  list_orgs: {
    items: 'orgs',
    noun: 'org',
    line: (o, Text) => described(Text, o.handle, [o.tier, o.role, o.isPersonal && 'personal'].filter(Boolean).join(', ')),
  },
  listBlobs: {
    items: 'blobs',
    noun: 'blob',
    target: args => args.storage?.val ?? args.storage?.org ?? '',
    line: (b, Text) => described(Text, b.key, `${size(b.size)}, modified ${when(b.lastModified)}`),
  },
  list_tags: {
    items: 'tags',
    noun: 'tag',
    target: (args, r) => args.handle ?? r.handle ?? '',
    line: (t, Text) => described(Text, t.tag, plural(t.valCount, 'val')),
  },
  list_env_groups: {
    items: 'groups',
    noun: 'group',
    target: args => args.val ?? '',
    line: (g, Text) => described(Text, g.name, g.id),
  },
}

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
}

type IntervalSettings = { type: string; delay?: number | null; unit?: string | null; cron?: string | null; isActive?: boolean }

function schedule(s: IntervalSettings): string {
  if (s.type === 'cron') return `cron ${s.cron}`
  const unit = s.unit && UNIT_MS[s.unit] ? s.unit : 'minute'
  const n = Math.round((s.delay ?? 0) / UNIT_MS[unit]!)
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`
}

function changed(additions: number, deletions: number): string {
  if (deletions === 0) return `Added ${plural(additions, 'line')}`
  if (additions === 0) return `Removed ${plural(deletions, 'line')}`
  return `Added ${plural(additions, 'line')}, removed ${plural(deletions, 'line')}`
}

export const register: Register = on => {
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    const { tool, input, output, isErrored, isExpanded } = e.props
    if (!tool.startsWith(PREFIX)) return next(e)

    const name = tool.slice(PREFIX.length)
    const { Box, Text, Code, Markdown } = $.ui.resolve(e)
    const args = (input ?? {}) as Record<string, any>
    const result = isErrored ? undefined : parseJson(output)

    // The terminal opens each tool row with a status bullet and a blank line, as its own rows do.
    const terminal = e.surface === 'terminal'
    // The bullet and ⎿ sit in their own column, so wrapped text hangs after them.
    const header = (target: string, failed = false) => (
      <Box flexDirection="row">
        {terminal ? <Text color={failed ? 'error' : 'success'}>⏺ </Text> : null}
        <Text>
          <Text bold>valtown {name}</Text>({target})
        </Text>
      </Box>
    )

    const summaryLine = (summary: string, failed = false) => (
      <Box flexDirection="row">
        <Text dimColor>⎿ </Text>
        {failed ? <Text color="error">{summary}</Text> : <Text dimColor>{summary}</Text>}
      </Box>
    )

    const row = (target: string, summary: string, body?: RenderChildren | false, failed = false) => (
      <Box flexDirection="column" marginTop={terminal ? 1 : 0}>
        {header(target, failed)}
        <Box paddingLeft={2} flexDirection="column">
          {summaryLine(summary, failed)}
          {body ? <Box paddingLeft={2}>{body}</Box> : null}
        </Box>
      </Box>
    )

    // What a call acts on, for the header of a tool without its own renderer.
    const target =
      name === 'copy_files'
        ? `${args.sourceVal} → ${args.destVal}`
        : name === 'revert_to_version'
          ? `v${args.version}`
          : [args.val, args.path].filter(Boolean).join('/') ||
            args.key ||
            args.url ||
            args.handle ||
            args.name ||
            String(args.filename ?? '').split('/').pop() ||
            ''

    // An errored call's output is the text the model read, often `{"error": "..."}`.
    const failure = isErrored ? parseJson(output)?.error : undefined
    if (typeof failure === 'string') return row(target, failure, false, true)

    const json = (value: unknown) => <Code source={JSON.stringify(value, null, 2)} language="json" />

    if (name === 'read_file' && typeof result?.content === 'string') {
      const { source, startLine } = stripLineNumbers(result.content)
      const lines = source === '' ? 0 : source.split('\n').length
      return row(
        `${args.val}/${args.path}`,
        isExpanded ? plural(lines, 'line') : `Read ${plural(lines, 'line')} (ctrl+o to expand)`,
        isExpanded && <Code source={source} path={args.path} startLine={startLine ?? 1} />,
      )
    }

    if (name === 'list_files' && result?.view === 'file_browser' && Array.isArray(result.files)) {
      const files = result.files as { name: string; type: string; endpoint?: string }[]
      return row(
        `${result.val}${result.path === '/' ? '' : `/${result.path}`}`,
        plural(files.length, 'entry', 'entries'),
        <Box flexDirection="column">
          {files.map(f => (
            <Text>
              {f.type === 'directory' ? <Text bold>{f.name}/</Text> : f.name}
              {f.type === 'directory' || f.type === 'file' ? '' : <Text dimColor> {f.type}</Text>}
              {f.endpoint ? <Text dimColor> {f.endpoint}</Text> : ''}
            </Text>
          ))}
        </Box>,
      )
    }

    // A list of lines, cut to COMPACT_ROWS until ctrl+o.
    const lines = <T,>(items: T[], line: (item: T) => RenderChildren) => {
      const shown = isExpanded ? items : items.slice(0, COMPACT_ROWS)
      return (
        <Box flexDirection="column">
          {shown.map(line)}
          {items.length > shown.length ? (
            <Text dimColor>… +{items.length - shown.length} more (ctrl+o to expand)</Text>
          ) : null}
        </Box>
      )
    }

    const logLines = (logs: { level: string; text: string; time?: string }[]) =>
      lines(logs, l => (
        <Text color={isErrorLevel(l.level) ? 'error' : l.level === 'warn' ? 'warning' : undefined}>
          {l.time ? <Text dimColor>{clock(l.time)} </Text> : ''}
          {l.text}
        </Text>
      ))

    // fetch_val_endpoint's result, also an edit's runResult.
    const http = (r: any) => {
      const response = r.response
      const language = bodyLanguage(response.headers?.['content-type'])
      const body = String(response.body ?? '')
      const length = response.originalLength ?? body.length
      return {
        summary: `${response.status}${response.statusText ? ` ${response.statusText}` : ''} · ${size(length)}${
          response.truncated ? ', truncated' : ''
        }${body && !isExpanded ? ' (ctrl+o to expand)' : ''}`,
        body: body && isExpanded && <Code source={pretty(body, language)} language={language} />,
      }
    }

    // run_file's result, also an edit's runResult.
    const run = (r: any) => {
      const logs = Array.isArray(r.logs) ? (r.logs as { log: string; level: string }[]) : []
      const failed = r.type !== 'return'
      const error = r.error === undefined ? undefined : typeof r.error === 'string' ? r.error : JSON.stringify(r.error, null, 2)
      return {
        summary: `${failed ? `Failed (${r.type})` : 'Ran'}, ${plural(logs.length, 'log line')}`,
        body: (logs.length > 0 || error) && (
          <Box flexDirection="column">
            {logLines(logs.map(l => ({ level: l.level, text: l.log })))}
            {error ? <Text color="error">{error}</Text> : null}
          </Box>
        ),
      }
    }

    if (name === 'fetch_val_endpoint' && result?.view === 'http_inspector' && result.response) {
      const { summary, body } = http(result)
      return row(`${result.request.method} ${result.request.url}`, summary, body)
    }

    if (name === 'get_logs' && result?.view === 'logs' && Array.isArray(result.logs)) {
      // Logs arrive newest first.
      const logs = [...(result.logs as { timestamp: string; level: string; body: string }[])].reverse()
      return row(
        args.fileId?.slice(0, 8) ?? '',
        `${plural(logs.length, 'log line')} since ${clock(result.timeWindow?.start)}${result.truncated ? ', more before' : ''}`,
        logs.length > 0 && logLines(logs.map(l => ({ level: l.level, text: l.body, time: l.timestamp }))),
      )
    }

    if (name === 'get_traces' && result?.view === 'traces' && Array.isArray(result.traces)) {
      type Trace = { name: string; startTime: string; durationMs: number; status: string; httpStatus?: number }
      const traces = result.traces as Trace[]
      return row(
        result.fileName ?? args.fileId?.slice(0, 8) ?? '',
        `${plural(traces.length, 'run')} since ${clock(result.timeWindow?.start)}${result.truncated ? ', more before' : ''}`,
        traces.length > 0 &&
          lines(traces, t => (
            <Text color={t.status === 'ok' && (t.httpStatus ?? 0) < 400 ? undefined : 'error'}>
              <Text dimColor>{clock(t.startTime)} </Text>
              {t.httpStatus ? `${t.httpStatus} ` : ''}
              {t.name} <Text dimColor>{t.durationMs}ms</Text>
            </Text>
          )),
      )
    }

    if (name === 'run_file' && result?.view === 'run_file') {
      const { summary, body } = run(result)
      return row(`${args.val}/${args.path}`, summary, body)
    }

    if (name === 'web_fetch' && typeof result?.content === 'string') {
      const content = result.content as string
      return row(
        result.url ?? args.url,
        `${result.status} · Fetched ${size(content.length)}${result.hasMore ? ` of ${size(result.totalSize)}` : ''}${
          content && !isExpanded ? ' (ctrl+o to expand)' : ''
        }`,
        content && isExpanded && <Text>{content}</Text>,
      )
    }

    if (name === 'find_val_town_skills' && Array.isArray(result?.matches)) {
      const matches = result.matches as { name: string; content: string; source?: string }[]
      return row(
        JSON.stringify(args.query ?? ''),
        matches.length === 0
          ? 'No guides found'
          : `Loaded ${matches.map(m => m.name).join(', ')} ${matches.length === 1 ? 'guide' : 'guides'}${
              isExpanded ? '' : ' (ctrl+o to expand)'
            }`,
        isExpanded && matches.length > 0 && <Markdown text={matches.map(m => m.content).join('\n\n---\n\n')} />,
      )
    }

    // sqlite_batch returns one result per statement, in order.
    const statements: { sql: string; result: SqlResult }[] | undefined =
      name === 'sqlite_execute' && Array.isArray(result?.rows)
        ? [{ sql: args.sql, result }]
        : name === 'sqlite_batch' && Array.isArray(result?.results)
          ? (result.results as SqlResult[]).map((r, i) => ({ sql: args.statements?.[i]?.sql, result: r }))
          : undefined
    if (statements) {
      const db = args.database ?? {}
      return (
        <Box flexDirection="column" marginTop={terminal ? 1 : 0}>
          {header(db.val ?? db.org)}
          {statements.map(({ sql, result: r }) => {
            const rows = Array.isArray(r?.rows) ? r.rows : []
            const summary = r?.columns?.length
              ? plural(rows.length, 'row')
              : `${plural(r?.rowsAffected ?? 0, 'row')} affected`
            return (
              <Box flexDirection="column">
                <Box paddingLeft={4}>
                  <Code source={String(sql ?? '')} language="sql" />
                </Box>
                <Box paddingLeft={2} flexDirection="column">
                  {summaryLine(`${summary}${rows.length && !isExpanded ? ' (ctrl+o to expand)' : ''}`)}
                  {rows.length && isExpanded ? (
                    <Box paddingLeft={2}>
                      <Markdown text={markdownTable(r.columns!, rows)} />
                    </Box>
                  ) : null}
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    }

    const edit = result?.view === 'file_edit' && Array.isArray(result.hunks) ? (result as FileEdit) : undefined
    if (edit && edit.hunks.length > 0) {
      const { additions = 0, deletions = 0 } = edit.stats ?? {}
      // An edit's runResult is flatter than the standalone tools' results.
      const r = edit.runResult
      const ran =
        r?.kind === 'fetch_val_endpoint'
          ? http({ response: r })
          : r?.kind === 'run_file'
            ? run({ ...r.outcome, logs: r.logs })
            : r
              ? { summary: `Ran${isExpanded ? '' : ' (ctrl+o to expand)'}`, body: isExpanded && json(r) }
              : undefined
      return (
        <Box flexDirection="column">
          {row(
            `${edit.val}/${edit.path}`,
            changed(additions, deletions),
            <Code source={unified(edit.hunks)} path={edit.path} format="diff" />,
          )}
          {ran ? (
            <Box paddingLeft={2} flexDirection="column">
              {summaryLine(ran.summary)}
              {ran.body ? <Box paddingLeft={2}>{ran.body}</Box> : null}
            </Box>
          ) : null}
        </Box>
      )
    }

    if (!result || typeof result !== 'object') {
      // Still running, errored or not JSON: keep the engine's row, but drop an edit's bulky strings.
      if (!EDIT_TOOLS.has(name)) return next(e)
      return next({ ...e, props: { ...e.props, input: { val: args.val, path: args.path } } })
    }

    // get_val_detail, create_val and remix_val all answer with the val.
    if (result.view === 'val_detail') {
      const branches = result.branches?.count ?? 0
      return row(
        result.identifier,
        `${result.privacy} code, ${result.httpPrivacy} endpoints, ${plural(branches, 'branch', 'branches')}`,
        (result.description || result.tags?.length) && (
          <Text>
            {result.description}
            {result.tags?.length ? <Text dimColor> #{result.tags.join(' #')}</Text> : ''}
          </Text>
        ),
      )
    }

    if (name === 'readBlob' && typeof result.sizeBytes === 'number') {
      const content = typeof result.content === 'string' ? (result.content as string) : ''
      const partial = result.offsetBytes > 0 || result.nextOffsetBytes != null
      const language = pretty(content, 'json') === content ? undefined : 'json'
      return row(
        result.key ?? args.key,
        `${size(result.sizeBytes)}${result.binary ? ', binary' : ''}${
          partial ? `, bytes ${result.offsetBytes}–${result.offsetBytes + result.bytesReturned}` : ''
        }, modified ${when(result.lastModified)}${content && !isExpanded ? ' (ctrl+o to expand)' : ''}`,
        content && isExpanded && <Code source={pretty(content, language)} language={language} />,
      )
    }

    // read_interval_settings and write_interval_settings.
    if (result.intervalSettings) {
      const s = result.intervalSettings as IntervalSettings
      return row(
        target,
        `${schedule(s)}${s.isActive === false ? ', paused' : ''}${result.nextRunAt ? `, next run ${when(result.nextRunAt)}` : ''}`,
      )
    }

    if (name === 'set_file_type' && result.newType) {
      return row(`${result.val ?? args.val}/${result.file?.name ?? ''}`, `${result.previousType} → ${result.newType}`)
    }

    if (name === 'request_file_upload' && result.upload_id) {
      return row(
        target,
        `Upload URL expires in ${Math.round(result.expires_in / 60)} min${isExpanded ? '' : ' (ctrl+o to expand)'}`,
        isExpanded && <Text>{result.curl_command}</Text>,
      )
    }

    // A result's message says more than an incidental array in it (update_val's updatedFields).
    const spec = LISTS[name]
    const field =
      spec?.items ??
      (typeof result.message === 'string' ? undefined : Object.keys(result).find(k => Array.isArray(result[k])))
    if (field && Array.isArray(result[field])) {
      const items = result[field] as any[]
      const more = result.hasMore || result.pagination?.hasNext
      const label = (item: any) =>
        typeof item === 'object' && item ? String(LABELS.map(k => item[k]).find(v => typeof v === 'string' || typeof v === 'number') ?? JSON.stringify(item)) : String(item)
      return row(
        spec?.target?.(args, result) ?? target,
        `${plural(items.length, spec?.noun ?? 'item', spec?.nouns)}${more ? ', more available' : ''}`,
        items.length > 0 && lines(items, item => (spec ? spec.line(item, Text) : <Text>{label(item)}</Text>)),
      )
    }

    // Anything else: its message, with the whole result under ctrl+o.
    const { _untrusted, ...rest } = result
    return row(
      target,
      `${typeof result.message === 'string' ? result.message : 'Done'}${isExpanded ? '' : ' (ctrl+o to expand)'}`,
      isExpanded && json(rest),
    )
  })
}
