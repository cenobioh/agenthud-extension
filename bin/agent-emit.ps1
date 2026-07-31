# Windows PowerShell equivalent of bin/agent-emit.
# Posts a status update to the local AgentHUD IPC server (127.0.0.1:$env:AGENTHUD_PORT, default 4545).
param(
  [Parameter(Mandatory = $true)][string]$Terminal,
  [Parameter(Mandatory = $true)][ValidateSet('WORKING', 'WAITING_ON_DECISION', 'IDLE')][string]$Status,
  [string]$Title,
  [string]$Prompt,
  [string]$Snippet
)

$port = if ($env:AGENTHUD_PORT) { $env:AGENTHUD_PORT } else { 4545 }

$payload = @{ terminalId = $Terminal; status = $Status }
if ($Title)   { $payload.taskTitle = $Title }
if ($Prompt)  { $payload.decisionPrompt = $Prompt }
if ($Snippet) { $payload.lastMessageSnippet = $Snippet }

$json = $payload | ConvertTo-Json -Compress

try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -Method Post -ContentType 'application/json' -Body $json | Out-Null
} catch {
  # Mirror the bash script's best-effort behavior: don't fail the caller (e.g. a Claude Code hook).
}
