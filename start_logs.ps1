# start_logs.ps1
# Opens Windows Terminal with split panes so every service shows its own live log.
# Usage:
#   .\start_logs.ps1            # stop current services, relaunch them in WT panes
#   .\start_logs.ps1 -DryRun    # just print the Windows Terminal command
#   .\start_logs.ps1 -NoFrontend
param(
    [switch]$DryRun,
    [switch]$NoFrontend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$services = @(
    [pscustomobject]@{ Tab = "Core";       Title = "Auth 8004";         Port = 8004; Module = "services.auth.main:app";         Reload = $true  },
    [pscustomobject]@{ Tab = "Core";       Title = "Order 8001";        Port = 8001; Module = "services.order.main:app";        Reload = $false },
    [pscustomobject]@{ Tab = "Core";       Title = "Notification 8002"; Port = 8002; Module = "services.notification.main:app"; Reload = $true  },
    [pscustomobject]@{ Tab = "Core";       Title = "Analytics 8003";    Port = 8003; Module = "services.analytics.main:app";    Reload = $true  },
    [pscustomobject]@{ Tab = "Dashboards"; Title = "Client 8006";       Port = 8006; Module = "services.client.main:app";       Reload = $true  },
    [pscustomobject]@{ Tab = "Dashboards"; Title = "Merchant 8007";     Port = 8007; Module = "services.merchant.main:app";     Reload = $true  },
    [pscustomobject]@{ Tab = "Dashboards"; Title = "Admin 8008";        Port = 8008; Module = "services.admin.main:app";        Reload = $true  }
)

function Stop-ServicePort([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "stopped old process on port $port"
    }
}

if (-not $DryRun) {
    foreach ($s in $services) { Stop-ServicePort $s.Port }
    $front = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    # Leave the frontend alone unless we are about to launch it as well.
    if (-not $NoFrontend -and $front) {
        Stop-Process -Id $front.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "stopped old frontend on port 3000"
    }
    Start-Sleep -Milliseconds 600
}

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONPATH = "$root;$root\services"

$wtArgs = [System.Collections.Generic.List[string]]::new()
$wtArgs.AddRange([string[]]@("-w", "0"))

$isFirstCommand = $true
$tabs = $services | Group-Object Tab
foreach ($tab in $tabs) {
    $firstInTab = $true
    foreach ($s in $tab.Group) {
        $reload = if ($s.Reload) { " --reload" } else { "" }
        $cmd = "python -m uvicorn $($s.Module) --host 0.0.0.0 --port $($s.Port)$reload"

        if ($isFirstCommand) {
            $wtArgs.AddRange([string[]]@(
                "new-tab", "--title", $s.Title, "-d", $root,
                "cmd", "/k", $cmd
            ))
            $isFirstCommand = $false
        } elseif ($firstInTab) {
            $wtArgs.AddRange([string[]]@(
                ";", "new-tab", "--title", $s.Title, "-d", $root,
                "cmd", "/k", $cmd
            ))
        } else {
            $wtArgs.AddRange([string[]]@(
                ";", "split-pane", "-H", "--title", $s.Title, "-d", $root,
                "cmd", "/k", $cmd
            ))
        }
        $firstInTab = $false
    }
}

if (-not $NoFrontend) {
    $wtArgs.AddRange([string[]]@(
        ";", "new-tab", "--title", "Frontend 3000", "-d", "$root\frontend",
        "cmd", "/k", "npm run dev"
    ))
}

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if (-not $wt) {
    Write-Warning "Windows Terminal (wt.exe) not found. Falling back to separate cmd windows."
    if (-not $DryRun) { & "$root\start_services.bat" }
    return
}

if ($DryRun) {
    Write-Host "`nWindows Terminal command:`n"
    Write-Host ("wt.exe " + ($wtArgs -join " "))
    return
}

Write-Host "Launching Windows Terminal with split panes..."
& $wt.Source @wtArgs
