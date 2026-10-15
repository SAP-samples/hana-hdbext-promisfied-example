// Block edits to credential/environment files
const payload = JSON.parse(require('fs').readFileSync(0, 'utf8') || '{}')
const input = payload.tool_input || {}
const tool = payload.tool_name || ''

const filePath = (input.file_path || input.filePath || '').replace(/\\/g, '/')

// Also check Bash commands that redirect into protected files
const command = input.command || ''

const ENV_FILE_RE = /default-env.*\.json|[/\\]?\.env$|[/\\]?\.env\./i
const SHRINKWRAP_RE = /npm-shrinkwrap\.json/i

if (ENV_FILE_RE.test(filePath)) {
  process.stderr.write('BLOCKED: Cannot edit credential/env files (default-env*.json, .env)')
  process.exit(2)
}
if (SHRINKWRAP_RE.test(filePath)) {
  process.stderr.write('BLOCKED: npm-shrinkwrap.json must only be updated by npm install, not edited directly.')
  process.exit(2)
}

// Block Bash commands that write to protected files via redirection or piping
if (tool === 'Bash' && command) {
  if (ENV_FILE_RE.test(command)) {
    process.stderr.write('BLOCKED: Bash command targets credential/env file (default-env*.json, .env). Use proper service bindings instead.')
    process.exit(2)
  }
  if (SHRINKWRAP_RE.test(command)) {
    process.stderr.write('BLOCKED: Bash command targets npm-shrinkwrap.json. Only npm install should update this file.')
    process.exit(2)
  }
}
