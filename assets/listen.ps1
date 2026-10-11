# Honey push-to-talk listener. Uses the built-in Windows desktop speech
# recognizer (offline, no keys, no cloud). Best with short commands.
# Usage: powershell -File listen.ps1 [-Seconds 10]
# Prints TEXT=<recognized> or NONE.
param([int]$Seconds = 10)
$ErrorActionPreference = 'SilentlyContinue'
try { Add-Type -AssemblyName System.Speech } catch { Write-Output 'NONE'; exit 0 }
try {
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
} catch {
  try { $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine('en-US') } catch { Write-Output 'NONE'; exit 0 }
}
try {
  $rec.SetInputToDefaultAudioDevice()
  $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $rec.BabbleTimeout = [TimeSpan]::FromSeconds(3)
  $rec.InitialSilenceTimeout = [TimeSpan]::FromSeconds(6)
  $rec.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.2)
  $res = $rec.Recognize([TimeSpan]::FromSeconds($Seconds))
  if ($res -and $res.Text -and $res.Confidence -ge 0.4) { Write-Output ('TEXT={0}' -f $res.Text.Trim()) }
  else { Write-Output 'NONE' }
} catch {
  Write-Output 'NONE'
} finally {
  try { $rec.Dispose() } catch { }
}
