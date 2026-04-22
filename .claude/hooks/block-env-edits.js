// Block edits to credential/environment files
const input = JSON.parse(process.env.CLAUDE_TOOL_INPUT || '{}')
const filePath = (input.file_path || '').replace(/\\/g, '/')

if (/default-env.*\.json|\/\.env$|\/\.env\./.test(filePath)) {
  process.stderr.write('BLOCKED: Cannot edit credential/env files (default-env*.json, .env)')
  process.exit(2)
}
if (/npm-shrinkwrap\.json$/.test(filePath)) {
  process.stderr.write('BLOCKED: npm-shrinkwrap.json must only be updated by npm install, not edited directly.')
  process.exit(2)
}
