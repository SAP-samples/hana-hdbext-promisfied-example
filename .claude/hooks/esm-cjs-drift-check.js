// Warn when index.js is edited without index.cjs (or vice versa)
const input = JSON.parse(process.env.CLAUDE_TOOL_INPUT || '{}')
const filePath = (input.file_path || '').replace(/\\/g, '/')

const match = filePath.match(/\/(hdb|hdbext)\/(index)\.(js|cjs)$/)
if (match) {
  const pkg = match[1]
  const ext = match[3]
  const other = ext === 'js' ? 'cjs' : 'js'
  process.stderr.write(
    `PARITY CHECK: You edited ${pkg}/index.${ext}. Don't forget to make the same change in ${pkg}/index.${other} to keep ESM/CJS aligned.`
  )
}
