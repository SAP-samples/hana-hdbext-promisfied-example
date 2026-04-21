// Remind to regenerate @types/ when entry points are edited
const input = JSON.parse(process.env.CLAUDE_TOOL_INPUT || '{}')
const filePath = (input.file_path || '').replace(/\\/g, '/')

const match = filePath.match(/\/(hdb|hdbext)\/index\.(js|cjs)$/)
if (match) {
  const pkg = match[1]
  const ext = match[2]
  process.stderr.write(
    `REMINDER: Entry point ${pkg}/index.${ext} was edited. Run \`npm run types\` in ${pkg}/ to regenerate @types/ declarations.`
  )
}
