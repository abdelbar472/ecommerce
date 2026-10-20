# start_all.ps1 - one command for the whole stack (PowerShell).
# Opens Windows Terminal with a split-pane per service so each log is visible,
# then starts the frontend.
param(
    [switch]$NoFrontend,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

& "$here\start_logs.ps1" -NoFrontend:$NoFrontend -DryRun:$DryRun
