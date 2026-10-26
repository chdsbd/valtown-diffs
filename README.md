# valtown-diffs

A Claude Code mod that draws file edits made through the Val Town MCP server as colored code
diffs, instead of the raw JSON the server returns.

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
valtown replace_in_file(cdignam/diff-render-test/main.ts)
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
tsc -p .   # after the first load lays .claude-plugin/types
```
