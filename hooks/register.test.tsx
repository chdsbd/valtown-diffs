import { expect, test } from 'claude-code/testing'

const PREFIX = 'mcp__plugin_valtown_valtown__'

const row = (name: string, input: unknown, output: string, isExpanded = false) => ({
  plugin: 'valtown-diffs',
  component: 'ToolUse',
  requestId: 't1',
  props: {
    tool_use_id: 't1',
    tool: PREFIX + name,
    input,
    output: [{ type: 'text', text: output }],
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    isExpanded,
  },
}) as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`read_file counts lines, and shows code when expanded (${surface})`, async $ => {
    const input = { val: 'cdignam/x', path: 'main.ts' }
    const output = JSON.stringify({ content: '  1|const a = 1\n  2|export default a\n', fileType: 'script' })

    let ui = await $.ui.mount({ ...row('read_file', input, output), surface })
    expect((await ui.find({ type: 'Text', text: /Read 2 lines/ }))?.text).toContain('ctrl+o')
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    await ui.unmount()

    ui = await $.ui.mount({ ...row('read_file', input, output, true), surface })
    const code = await ui.find({ type: 'Code' })
    expect(code?.props).toMatchObject({ source: 'const a = 1\nexport default a', startLine: 1 })
    await ui.unmount()
  })

  test(`list_files lists entries (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'file_browser',
      val: 'cdignam/x',
      path: '/',
      files: [
        { name: 'public', type: 'directory' },
        { name: 'main.ts', type: 'http', endpoint: 'https://x.val.run/' },
      ],
    })
    const ui = await $.ui.mount({ ...row('list_files', { val: 'cdignam/x' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /2 entries/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /public\// })).toBeDefined()
    await ui.unmount()
  })

  test(`sqlite_execute draws the query and its rows (${surface})`, async $ => {
    const input = { sql: 'SELECT id FROM t', database: { type: 'val', val: 'cdignam/x' } }
    const output = `<untrusted-output>\n${JSON.stringify({ columns: ['id'], rows: [{ id: 1 }, { id: 2 }] })}\n</untrusted-output>`
    const ui = await $.ui.mount({ ...row('sqlite_execute', input, output, true), surface })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: 'SELECT id FROM t', language: 'sql' })
    expect(await ui.find({ type: 'Text', text: /2 rows/ })).toBeDefined()
    expect((await ui.find({ type: 'Markdown' }))?.props).toMatchObject({ text: expect.stringContaining('| 2 |') })
    await ui.unmount()
  })

  test(`sqlite_batch draws each statement and its rows (${surface})`, async $ => {
    const input = {
      statements: [{ sql: 'SELECT id FROM t' }, { sql: 'DELETE FROM t' }],
      database: { type: 'val', val: 'cdignam/x' },
    }
    const output = JSON.stringify({
      results: [
        { columns: ['id'], rows: [{ id: 1 }] },
        { columns: [], rows: [], rowsAffected: 3 },
      ],
    })
    const ui = await $.ui.mount({ ...row('sqlite_batch', input, output), surface })
    expect(await ui.findAll({ type: 'Code' })).toHaveLength(2)
    expect(await ui.find({ type: 'Code', text: 'DELETE FROM t' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /1 row/ }))?.text).toContain('ctrl+o')
    expect(await ui.find({ type: 'Text', text: /3 rows affected/ })).toBeDefined()
    await ui.unmount()
  })

  test(`fetch_val_endpoint shows status, and the body when expanded (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'http_inspector',
      request: { method: 'GET', url: 'https://x.val.run/' },
      response: {
        status: 200,
        statusText: '',
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
        truncated: false,
        originalLength: 11,
      },
    })
    const input = { val: 'cdignam/x', path: 'main.ts' }
    let ui = await $.ui.mount({ ...row('fetch_val_endpoint', input, output), surface })
    expect(await ui.find({ type: 'Text', text: 'GET https://x.val.run/' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /200 · 11 B/ }))?.text).toContain('ctrl+o')
    await ui.unmount()

    ui = await $.ui.mount({ ...row('fetch_val_endpoint', input, output, true), surface })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: '{\n  "ok": true\n}', language: 'json' })
    await ui.unmount()
  })

  test(`get_logs lists logs oldest first, cut to ten (${surface})`, async $ => {
    const logs = Array.from({ length: 12 }, (_, i) => ({
      timestamp: `2026-10-27T13:03:${String(30 - i).padStart(2, '0')}.000Z`,
      level: 'stdout',
      body: `line ${12 - i}`,
    }))
    const output = JSON.stringify({ view: 'logs', timeWindow: { start: '2026-10-27T12:00:00.000Z' }, logs })
    const ui = await $.ui.mount({ ...row('get_logs', { fileId: '57ef5a30-d169' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /12 log lines/ })).toBeDefined()
    const shown = await ui.findAll({ type: 'Text', text: /line \d+/ })
    expect(shown[0]?.text).toContain('line 1')
    expect(await ui.find({ type: 'Text', text: /\+2 more/ })).toBeDefined()
    await ui.unmount()
  })

  test(`get_traces lists runs (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'traces',
      fileName: 'mcp.ts',
      timeWindow: { start: '2026-10-27T12:00:00.000Z' },
      traces: [
        { name: 'GET https://x.val.run/', startTime: '2026-10-27T13:03:15.386Z', durationMs: 652, status: 'ok', httpStatus: 200 },
      ],
    })
    const ui = await $.ui.mount({ ...row('get_traces', { fileId: 'abc' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /1 run since/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /200 GET https:\/\/x.val.run\/ 652ms/ })).toBeDefined()
    await ui.unmount()
  })

  test(`run_file shows its logs (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'run_file',
      type: 'return',
      logs: [{ log: 'Hi there, world!', level: 'stdout' }],
    })
    const ui = await $.ui.mount({ ...row('run_file', { val: 'cdignam/x', path: 'main.ts' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /Ran, 1 log line/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Hi there, world!' })).toBeDefined()
    await ui.unmount()
  })

  test(`web_fetch shows the size (${surface})`, async $ => {
    const output = `<untrusted-output>\n${JSON.stringify({ url: 'https://example.com/', status: 200, content: 'hello', hasMore: false })}\n</untrusted-output>`
    const ui = await $.ui.mount({ ...row('web_fetch', { url: 'https://example.com' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /200 · Fetched 5 B/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'hello' })).toBeUndefined()
    await ui.unmount()
  })

  test(`find_val_town_skills names the guides it loaded (${surface})`, async $ => {
    const output = JSON.stringify({ matches: [{ name: 'blob-storage', content: '# Blob Storage', source: 'official' }] })
    const ui = await $.ui.mount({ ...row('find_val_town_skills', { query: 'blobs' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /Loaded blob-storage guide/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    await ui.unmount()
  })

  test(`an edit with run: shows the run under its diff (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'file_edit',
      val: 'cdignam/x',
      path: 'main.ts',
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: 'del', text: 'a' }, { kind: 'add', text: 'b' }] }],
      stats: { additions: 1, deletions: 1 },
      runResult: {
        kind: 'run_file',
        logs: [{ log: 'hello', level: 'stdout' }],
        outcome: { type: 'return', evaluationId: 'e1' },
      },
    })
    const ui = await $.ui.mount({ ...row('replace_in_file', { val: 'cdignam/x', path: 'main.ts' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /Added 1 line, removed 1 line/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Ran, 1 log line/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'hello' })).toBeDefined()
    await ui.unmount()
  })

  test(`an edit with a fetch run: shows the response under its diff (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'file_edit',
      val: 'cdignam/x',
      path: 'http.ts',
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: 'del', text: 'a' }, { kind: 'add', text: 'b' }] }],
      stats: { additions: 1, deletions: 1 },
      runResult: {
        kind: 'fetch_val_endpoint',
        url: 'https://x.val.run/',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
      },
    })
    const input = { val: 'cdignam/x', path: 'http.ts' }
    let ui = await $.ui.mount({ ...row('replace_in_file', input, output), surface })
    expect((await ui.find({ type: 'Text', text: /200 · 11 B/ }))?.text).toContain('ctrl+o')
    await ui.unmount()

    ui = await $.ui.mount({ ...row('replace_in_file', input, output, true), surface })
    const codes = await ui.findAll({ type: 'Code' })
    expect(codes.map(c => c.props?.source)).toContain('{\n  "ok": true\n}')
    await ui.unmount()
  })

  test(`list_vals lists vals with their descriptions (${surface})`, async $ => {
    const output = JSON.stringify({
      user: { handle: 'cdignam' },
      hasMore: true,
      vals: [{ identifier: 'cdignam/card-balance', description: 'Card balances' }],
    })
    const ui = await $.ui.mount({ ...row('list_vals', {}, output), surface })
    expect(await ui.find({ type: 'Text', text: '1 val, more available' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cdignam\/card-balance Card balances/ })).toBeDefined()
    await ui.unmount()
  })

  test(`list_branches counts branches (${surface})`, async $ => {
    const output = JSON.stringify({
      branches: [
        { name: 'main', version: 95, updatedAt: '2026-10-27T12:52:47.912Z' },
        { name: 'dev', version: 3, updatedAt: '2026-10-27T12:52:47.912Z' },
      ],
    })
    const ui = await $.ui.mount({ ...row('list_branches', { val: 'cdignam/x' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /2 branches/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /main v95, updated/ })).toBeDefined()
    await ui.unmount()
  })

  test(`get_val_detail summarizes the val (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'val_detail',
      identifier: 'cdignam/x',
      privacy: 'private',
      httpPrivacy: 'public',
      description: 'A val',
      tags: ['finance'],
      branches: { count: 1 },
    })
    const ui = await $.ui.mount({ ...row('get_val_detail', { val: 'cdignam/x' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /private code, public endpoints, 1 branch/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /A val #finance/ })).toBeDefined()
    await ui.unmount()
  })

  test(`list_env_groups lists groups (${surface})`, async $ => {
    const output = JSON.stringify({ count: 1, groups: [{ id: 'g1', name: 'shared-creds' }] })
    const ui = await $.ui.mount({ ...row('list_env_groups', {}, output), surface })
    expect(await ui.find({ type: 'Text', text: /1 group/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /shared-creds g1/ })).toBeDefined()
    await ui.unmount()
  })

  test(`a list tool without its own renderer lists by name (${surface})`, async $ => {
    const output = JSON.stringify({ count: 1, variables: [{ key: 'SLACK_TOKEN' }] })
    const ui = await $.ui.mount({ ...row('list_env_group_vars', { groupId: 'g1' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /1 item/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'SLACK_TOKEN' })).toBeDefined()
    await ui.unmount()
  })

  test(`get_val_history lists versions (${surface})`, async $ => {
    const output = JSON.stringify({
      val: 'cdignam/x',
      branch: 'main',
      pagination: { hasNext: false },
      history: [
        { version: 2, createdAt: '2026-10-27T13:22:41.507Z', user: { handle: 'cdignam' }, file: { name: 'main.ts' } },
        { version: 1, createdAt: '2026-10-27T13:22:27.315Z', user: { handle: 'cdignam' }, merge: {} },
      ],
    })
    const ui = await $.ui.mount({ ...row('get_val_history', { val: 'cdignam/x' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /2 versions/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /v2 .* cdignam main\.ts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /v1 .* cdignam merge/ })).toBeDefined()
    await ui.unmount()
  })

  test(`create_val summarizes the new val (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'val_detail',
      identifier: 'cdignam/new',
      privacy: 'private',
      httpPrivacy: 'public',
      branches: { count: 1 },
    })
    const ui = await $.ui.mount({ ...row('create_val', { name: 'new' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /cdignam\/new/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /private code, public endpoints, 1 branch/ })).toBeDefined()
    await ui.unmount()
  })

  test(`an errored call shows its error (${surface})`, async $ => {
    const output = JSON.stringify({ error: 'Restricted HTTP access requires a paid business plan.' }, null, 2)
    const ui = await $.ui.mount({
      ...row('list_bypass_tokens', { val: 'cdignam/x' }, output),
      props: { ...row('list_bypass_tokens', { val: 'cdignam/x' }, output).props, isErrored: true },
      surface,
    })
    expect(await ui.find({ type: 'Text', text: /requires a paid business plan/ })).toBeDefined()
    await ui.unmount()
  })

  test(`a message wins over an incidental array (${surface})`, async $ => {
    const output = JSON.stringify({ success: true, message: 'Successfully updated val', updatedFields: ['tags'] })
    const ui = await $.ui.mount({ ...row('update_val', { val: 'cdignam/x' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /Successfully updated val/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 item/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`copy_files names both vals (${surface})`, async $ => {
    const output = JSON.stringify({ success: true, message: 'Copied: 1 copied.', results: [{ source: 'a.ts' }] })
    const input = { sourceVal: 'cdignam/a', destVal: 'cdignam/b', sources: ['a.ts'] }
    const ui = await $.ui.mount({ ...row('copy_files', input, output), surface })
    expect(await ui.find({ type: 'Text', text: /cdignam\/a → cdignam\/b/ })).toBeDefined()
    await ui.unmount()
  })

  test(`interval settings read as a schedule (${surface})`, async $ => {
    const input = { val: 'cdignam/x', path: 'cron.ts' }
    let ui = await $.ui.mount({
      ...row('read_interval_settings', input, JSON.stringify({ intervalSettings: { type: 'delay', delay: 3_600_000, unit: 'hour', cron: null, isActive: true } })),
      surface,
    })
    expect(await ui.find({ type: 'Text', text: /every hour/ })).toBeDefined()
    await ui.unmount()

    ui = await $.ui.mount({
      ...row(
        'write_interval_settings',
        input,
        JSON.stringify({ message: 'Updated', intervalSettings: { type: 'cron', cron: '0 9 * * 1' }, nextRunAt: '2026-11-02T09:00:00.000Z' }),
      ),
      surface,
    })
    expect(await ui.find({ type: 'Text', text: /cron 0 9 \* \* 1, next run 2026-11-0\d/ })).toBeDefined()
    await ui.unmount()
  })

  test(`set_file_type shows the change of type (${surface})`, async $ => {
    const output = JSON.stringify({ val: 'cdignam/x', previousType: 'interval', newType: 'script', file: { name: 'cron.ts' } })
    const ui = await $.ui.mount({ ...row('set_file_type', { val: 'cdignam/x', fileId: 'f1' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /cdignam\/x\/cron\.ts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /interval → script/ })).toBeDefined()
    await ui.unmount()
  })

  test(`a new file's diff counts only added lines (${surface})`, async $ => {
    const output = JSON.stringify({
      view: 'file_edit',
      val: 'cdignam/x',
      path: 'a.ts',
      hunks: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: [{ kind: 'add', text: 'a' }] }],
      stats: { additions: 1, deletions: 0 },
    })
    const ui = await $.ui.mount({ ...row('create_file', { val: 'cdignam/x', path: 'a.ts' }, output), surface })
    expect(await ui.find({ type: 'Text', text: /^Added 1 line$/ })).toBeDefined()
    await ui.unmount()
  })

  test(`listBlobs lists keys with their sizes (${surface})`, async $ => {
    const output = `<untrusted-output>\n${JSON.stringify({
      count: 1,
      blobs: [{ key: 'seen-post-urls', size: 621, lastModified: '2026-10-05T15:26:34.000Z' }],
    })}\n</untrusted-output>`
    const ui = await $.ui.mount({ ...row('listBlobs', { storage: { type: 'val', val: 'cdignam/x' } }, output), surface })
    expect(await ui.find({ type: 'Text', text: 'cdignam/x' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 blob/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /seen-post-urls 621 B, modified/ })).toBeDefined()
    await ui.unmount()
  })

  test(`readBlob shows JSON content when expanded (${surface})`, async $ => {
    const output = JSON.stringify({
      key: 'seen-post-urls',
      sizeBytes: 9,
      lastModified: '2026-10-05T15:26:34.000Z',
      content: '["a","b"]',
      offsetBytes: 0,
      bytesReturned: 9,
      nextOffsetBytes: null,
    })
    const input = { key: 'seen-post-urls', storage: { type: 'val', val: 'cdignam/x' } }
    let ui = await $.ui.mount({ ...row('readBlob', input, output), surface })
    expect((await ui.find({ type: 'Text', text: /9 B, modified/ }))?.text).toContain('ctrl+o')
    await ui.unmount()

    ui = await $.ui.mount({ ...row('readBlob', input, output, true), surface })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: '[\n  "a",\n  "b"\n]', language: 'json' })
    await ui.unmount()
  })

  test(`readBlob of a binary blob has nothing to expand (${surface})`, async $ => {
    const output = JSON.stringify({
      key: 'icon.png',
      sizeBytes: 1609,
      lastModified: '2026-06-14T02:17:31.000Z',
      binary: true,
      content: null,
      offsetBytes: 0,
      bytesReturned: 1609,
      nextOffsetBytes: null,
    })
    const ui = await $.ui.mount({ ...row('readBlob', { key: 'icon.png' }, output), surface })
    expect((await ui.find({ type: 'Text', text: /1\.6 KB, binary, modified/ }))?.text).not.toContain('ctrl+o')
    await ui.unmount()
  })

  test(`any other tool shows its message, and the result when expanded (${surface})`, async $ => {
    const output = JSON.stringify({ success: true, message: 'Renamed a.ts to b.ts' })
    const input = { val: 'cdignam/x', path: 'a.ts' }
    let ui = await $.ui.mount({ ...row('rename_file', input, output), surface })
    expect((await ui.find({ type: 'Text', text: /Renamed a.ts to b.ts/ }))?.text).toContain('ctrl+o')
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    await ui.unmount()

    ui = await $.ui.mount({ ...row('rename_file', input, output, true), surface })
    expect(await ui.find({ type: 'Code', text: /"success": true/ })).toBeDefined()
    await ui.unmount()
  })
}

test('the terminal opens a row with a bullet', async $ => {
  const output = JSON.stringify({ success: true, message: 'Done it' })
  const ui = await $.ui.mount({ ...row('rename_file', { val: 'cdignam/x' }, output), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '⏺ ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^valtown rename_file\(cdignam\/x\)$/ })).toBeDefined()
  await ui.unmount()
})
