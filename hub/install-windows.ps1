# Installs the NMC Hub as a Windows service that starts with the machine. Run as Administrator from this folder.
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found - installing with winget..."; winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
if (-not (Test-Path "$here\.env")) { Copy-Item "$here\.env.example" "$here\.env"; Write-Host "Created .env - EDIT IT (admin token, GitHub token) then re-run this script." ; exit 1 }
$node = (Get-Command node).Source
$task = "NMC Hub"
schtasks /Delete /TN $task /F 2>$null | Out-Null
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$here\start.js`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM" | Out-Null
Start-ScheduledTask -TaskName $task
Write-Host "NMC Hub installed and started. Dashboard: http://localhost:8787   Logs: Task Scheduler > NMC Hub"
