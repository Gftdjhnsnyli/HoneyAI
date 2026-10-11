# Honey app finder. Searches Start Menu shortcuts fuzzily.
# Usage: powershell -File app-find.ps1 -Query "chrome"
# Prints APP=score|name|path lines (best first) or NONE.
param([string]$Query = '')
$ErrorActionPreference = 'SilentlyContinue'
$q = $Query.ToLower().Trim()
if (-not $q) { Write-Output 'NONE'; exit 0 }

$dirs = @(
  (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
)
$seen = @{}
$found = @()
foreach ($d in $dirs) {
  if (-not (Test-Path -LiteralPath $d)) { continue }
  Get-ChildItem -LiteralPath $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
    if ($seen.ContainsKey($name)) { return }
    $seen[$name] = $true
    $nl = $name.ToLower()
    $score = -1
    if ($nl -eq $q) { $score = 100 }
    elseif ($nl.StartsWith($q)) { $score = 80 }
    elseif ($nl.Contains($q)) { $score = 60 }
    else {
      $qi = 0
      foreach ($c in $nl.ToCharArray()) {
        if ($qi -lt $q.Length -and $c -eq $q[$qi]) { $qi++ }
      }
      if ($qi -eq $q.Length -and $q.Length -ge 2) { $score = 40 }
    }
    if ($score -ge 0) { $found += ('APP={0}|{1}|{2}' -f $score, $name, $_.FullName) }
  }
}
# Fallback: classic inbox exes (covers Store-era Windows where .lnk entries are missing).
$sys32 = Join-Path $env:WINDIR 'System32'
if (Test-Path -LiteralPath $sys32) {
  Get-ChildItem -LiteralPath $sys32 -Filter *.exe -ErrorAction SilentlyContinue | ForEach-Object {
    $base = ([IO.Path]::GetFileNameWithoutExtension($_.Name)).ToLower()
    if ($seen.ContainsKey($base)) { return }
    $score = -1
    if ($base -eq $q) { $score = 90 }
    elseif ($base.StartsWith($q)) { $score = 70 }
    elseif ($q.Length -ge 4 -and $base.Contains($q)) { $score = 55 }
    if ($score -ge 0) {
      $seen[$base] = $true
      $found += ('APP={0}|{1}|{2}' -f $score, $_.Name, $_.FullName)
    }
  }
}
if (-not $found -or $found.Count -eq 0) { Write-Output 'NONE'; exit 0 }
$ranked = $found | Sort-Object { [int]((($_ -split '\|')[0]) -replace '^APP=', '') } -Descending | Select-Object -First 5
$ranked | ForEach-Object { Write-Output $_ }
