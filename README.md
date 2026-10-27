# valtown-diffs

A Claude Code mod that draws Val Town MCP results the way Claude Code draws its own tools,
instead of the raw JSON the server returns. [Examples](#examples) shows how each tool is drawn.

## Before

```
⏺ plugin:valtown:valtown - replace_in_file (MCP)(val: "cdignam/diff-render-test", path: "main.ts", old_string: "console.log(greet(\"  world  \"));", new_string:
  "for (const name of [\"  world  \", \"Val Town\"]) {\n  console.log(greet(name));\n}")
  ⎿  {
       "view": "file_edit",
       "message": "Successfully replaced 1 occurrence(s) in main.ts",
       "val": "cdignam/diff-render-test",
       "branch": "main",
       "path": "main.ts",
       "fileType": "script",
       "hunks": [
         {
           "oldStart": 3,
           "oldLines": 4,
           "newStart": 3,
           "newLines": 6,
           "lines": [
             {
               "kind": "ctx",
               "text": "  return `Hello, ${trimmed}! 👋`;",
               "oldLine": 3,
               "newLine": 3
             },
     … +40 lines
```

## After

```
⏺ valtown replace_in_file(cdignam/diff-render-test/main.ts)
  ⎿ Added 3 lines, removed 1 line
     3    return `Hello, ${trimmed}! 👋`;
     4  }
     5
     6 -console.log(greet("  world  "));
     6 +for (const name of ["  world  ", "Val Town"]) {
     7 +  console.log(greet(name));
     8 +}
```

In the terminal the removed and added lines are shaded red and green, as in
Claude Code's own edit diffs.

## Examples

These are the compact rows. ctrl+o (or `--verbose`) shows what each one notes it holds back,
and for tools drawn from their `message`, the whole result.

### Files

`replace_in_file`, `update_file`, `create_file` and `insert_at_line` draw their diff. With
`run:`, the run's logs or the endpoint's response follow it.

```
⏺ valtown replace_in_file(cdignam/render-test-scratch/main.ts)
  ⎿ Added 4 lines, removed 1 line
     2    return `Hello, ${name}!`;
     3  }
     4
     5 -console.log(greet("world"));
     5 +for (const n of ["world", "Val Town"]) {
     6 +  console.log(greet(n));
     7 +}
     8 +console.error("oops");
  ⎿ Ran, 3 log lines
    Hello, world!
    Hello, Val Town!
    oops

⏺ valtown create_file(cdignam/render-test-scratch/cron.ts)
  ⎿ Added 1 line
     1 +export default () => console.log("tick");
```

`read_file` counts lines, with the highlighted file under ctrl+o. `list_files` lists the
directory, with each file's type and endpoint.

```
⏺ valtown read_file(cdignam/render-test-scratch/main.ts)
  ⎿ Read 11 lines (ctrl+o to expand)

⏺ valtown list_files(cdignam/render-test-scratch)
  ⎿ 4 entries
    main.ts script
    lib/
    http.ts http https://cdignam--76e1b974d20911f183ab1607ee4eb77e.web.val.run
    cron.ts interval
```

### Running

`run_file` shows its logs, stderr in red. `fetch_val_endpoint` shows the request and its status
and size, with the highlighted body under ctrl+o.

```
⏺ valtown run_file(cdignam/render-test-scratch/main.ts)
  ⎿ Ran, 3 log lines
    Hello, world!
    Hello, Val Town!
    oops

⏺ valtown fetch_val_endpoint(GET https://cdignam--76e1b974d20911f183ab1607ee4eb77e.web.val.run/again)
  ⎿ 200 · 27 B (ctrl+o to expand)
```

`get_logs` and `get_traces` list timestamped lines, oldest log first and errors in red, cut to
ten until ctrl+o.

```
⏺ valtown get_logs(76e1b974)
  ⎿ 2 log lines since 08:23:57
    09:22:39 hit /hello
    09:23:02 hit /again

⏺ valtown get_traces(http.ts)
  ⎿ 2 runs since 08:23:56
    09:23:01 200 GET https://cdignam--76e1b974d20911f183ab1607ee4eb77e.web.val.run/again 237ms
    09:22:39 200 GET https://cdignam--76e1b974d20911f183ab1607ee4eb77e.web.val.run/hello 224ms
```

### SQLite

`sqlite_execute` and `sqlite_batch` draw each highlighted statement and its row count, with the
rows as a table under ctrl+o.

```
⏺ valtown sqlite_batch(cdignam/render-test-scratch)
    CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY, name TEXT, note TEXT)
  ⎿ 0 rows affected
    INSERT INTO people (name, note) VALUES (?, ?), (?, ?)
  ⎿ 2 rows affected

⏺ valtown sqlite_execute(cdignam/render-test-scratch)
    SELECT id, name, note FROM people ORDER BY id
  ⎿ 2 rows (ctrl+o to expand)
```

Expanded, the rows are a table:

```
⏺ valtown sqlite_execute(cdignam/render-test-scratch)
    SELECT id, name, note FROM people ORDER BY id
  ⎿ 2 rows
    ┌─────┬───────┬────────────────┐
    │ id  │ name  │      note      │
    ├─────┼───────┼────────────────┤
    │ 1   │ Ada   │ pipe | in note │
    ├─────┼───────┼────────────────┤
    │ 2   │ Grace │                │
    └─────┴───────┴────────────────┘
```

### Blobs, pages and guides

`readBlob`, `web_fetch` and `find_val_town_skills` draw a one-line summary, with the blob, page
or guide under ctrl+o. `listBlobs` lists keys.

```
⏺ valtown readBlob(seen-post-urls)
  ⎿ 621 B, modified 2026-10-05 11:26 (ctrl+o to expand)

⏺ valtown listBlobs(cdignam/steve-dignam-blog-watcher)
  ⎿ 1 blob
    seen-post-urls 621 B, modified 2026-10-05 11:26

⏺ valtown web_fetch(https://example.com/)
  ⎿ 200 · Fetched 156 B (ctrl+o to expand)

⏺ valtown find_val_town_skills("blob storage")
  ⎿ Loaded blob-storage guide (ctrl+o to expand)
```

### Vals

`get_val_detail`, `create_val` and `remix_val` summarize the val.

```
⏺ valtown get_val_detail(cdignam/steve-dignam-blog-watcher)
  ⎿ private code, public endpoints, 1 branch
    Daily check of steve.dignam.xyz; emails on new posts #email #monitoring #rss
```

`list_vals`, `get_val_history`, `list_branches`, `list_env_vars`, `list_env_groups`,
`find_templates`, `list_orgs` and `list_tags` draw one line per item, cut to ten until ctrl+o.

```
⏺ valtown get_val_history(cdignam/render-test-scratch@main)
  ⎿ 3 versions, more available
    v16 2026-10-27 09:24 cdignam copied.ts
    v15 2026-10-27 09:24 cdignam main.ts
    v14 2026-10-27 09:24 cdignam copied.ts

⏺ valtown list_branches(cdignam/render-test-scratch)
  ⎿ 1 branch
    main v9, updated 2026-10-27 09:22

⏺ valtown list_env_vars(cdignam/render-test-scratch)
  ⎿ 1 env var
    TEST_KEY Render test

⏺ valtown list_tags(cdignam)
  ⎿ 21 tags
    rss 4 vals
    website 3 vals
    monitoring 2 vals
    notifications 2 vals
    ai 1 val
    apple-wallet 1 val
    auth 1 val
    discord 1 val
    email 1 val
    finance 1 val
    … +11 more (ctrl+o to expand)

⏺ valtown list_env_groups()
  ⎿ 0 groups
```

`list_bypass_tokens`, `list_allowed_users` and `list_env_group_vars` list items the same way,
each labelled by its name, key or id.

### Settings

```
⏺ valtown read_interval_settings(cdignam/render-test-scratch/cron.ts)
  ⎿ every hour

⏺ valtown write_interval_settings(cdignam/render-test-scratch/cron.ts)
  ⎿ cron 0 9 * * 1, next run 2026-11-02 04:00

⏺ valtown set_file_type(cdignam/render-test-scratch/cron.ts)
  ⎿ interval → script

⏺ valtown request_file_upload(upload.txt)
  ⎿ Upload URL expires in 5 min (ctrl+o to expand)
```

### Everything else

`append_to_file`, `prepend_to_file`, `create_directory`, `rename_file`, `move_file`,
`copy_files`, `delete_file`, `create_branch`, `merge_branch`, `delete_branch`,
`revert_to_version`, `update_val`, `delete_val`, `add_env_var`, `attach_env_group`,
`detach_env_group`, `storeBlob`, `storeBlobFromUrl`, `deleteBlob`, `set_http_privacy`,
`set_custom_subdomain`, `add_allowed_user`, `remove_allowed_user`, `create_bypass_token` and
`revoke_bypass_token` draw their target and the result's `message`, with the whole result under
ctrl+o.

```
⏺ valtown copy_files(cdignam/render-test-scratch → cdignam/render-test-scratch)
  ⎿ Copied from cdignam/render-test-scratch to cdignam/render-test-scratch: 1 copied. (ctrl+o to expand)

⏺ valtown merge_branch(cdignam/render-test-scratch)
  ⎿ Successfully merged branch 'feature' into 'main'. (ctrl+o to expand)
```

A call that fails shows its error in red, with a red bullet:

```
⏺ valtown list_bypass_tokens(cdignam/render-test-scratch)
  ⎿ Restricted HTTP access requires a paid business plan. Upgrade this organization to restrict
    who can call this val's endpoints.
```

## Install

```
/plugin marketplace add chdsbd/valtown-diffs
/plugin install valtown-diffs@valtown-diffs
```

Restart Claude Code afterwards. It needs the Val Town MCP plugin, whose edit results it redraws.

## Develop

```sh
claude --plugin-dir .
claude plugin validate .
claude plugin test .
tsc -p .   # after the first load lays .claude-plugin/types
```
