# Honey file finder. Searches file names under common roots (depth-limited).
# Usage: powershell -File file-find.ps1 -Query "invoice" [-Roots "C:\Users\x\Desktop;D:\"]
# Prints FILE=fullpath lines or NONE.
param([string]$Query = '', [string]$Roots = '')
$ErrorActionPreference = 'SilentlyContinue'
$q = $Query.Trim()
if (-not $q) { Write-Output 'NONE'; exit 0 }
$safe = ($q -replace '[\[\]]', '?').Trim()
if (-not $safe) { Write-Output 'NONE'; exit 0 }

if ($Roots) {
  $roots = $Roots -split ';' | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
} else {
  $roots = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('MyDocuments'),
    (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads')
  )
  if (Test-Path -LiteralPath 'D:\') { $roots += 'D:\' }
  $roots = $roots | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
}
$found = @()
foreach ($r in $roots) {
  Get-ChildItem -LiteralPath $r -Recurse -Depth 4 -File -Filter "*$safe*" -ErrorAction SilentlyContinue |
    Select-Object -First 8 | ForEach-Object {
      if ($found.Count -lt 8 -and -not ($found -contains $_.FullName)) { $found += $_.FullName }
    }
  if ($found.Count -ge 8) { break }
}
if ($found.Count -eq 0) { Write-Output 'NONE'; exit 0 }
$found | Select-Object -First 8 | ForEach-Object { Write-Output "FILE=$_" }
