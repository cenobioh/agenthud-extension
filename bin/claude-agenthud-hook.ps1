# Windows PowerShell equivalent of bin/claude-agenthud-hook.
# Reads the hook's JSON payload from stdin and emits a matching AgentHUD status
# via agent-emit.ps1. No-ops silently if AGENTHUD_TERMINAL isn't set.

$terminal = $env:AGENTHUD_TERMINAL
if (-not $terminal) {
  exit 0
}

$title = if ($env:AGENTHUD_TITLE) { $env:AGENTHUD_TITLE } else { 'Claude session' }
$agentEmit = Join-Path $PSScriptRoot 'agent-emit.ps1'

$raw = [Console]::In.ReadToEnd()
try {
  $payload = $raw | ConvertFrom-Json
} catch {
  exit 0
}

switch ($payload.hook_event_name) {
  { $_ -in 'UserPromptSubmit', 'PreToolUse' } {
    & $agentEmit -Terminal $terminal -Title $title -Status WORKING
  }
  'Stop' {
    & $agentEmit -Terminal $terminal -Title $title -Status IDLE -Snippet 'Turn complete'
  }
  'Notification' {
    if ($payload.notification_type -eq 'permission_prompt') {
      $tool = if ($payload.tool_name) { $payload.tool_name } else { 'a tool' }
      & $agentEmit -Terminal $terminal -Title $title -Status WAITING_ON_DECISION -Prompt "Approve $tool?"
    }
  }
}

exit 0
