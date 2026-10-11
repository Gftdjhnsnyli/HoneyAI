# Honey media control v2. Talks to the running media app directly.
# Usage: powershell -File media-control.ps1 -Action next|prev|playpause|play|pause|stop|seekfwd|seekback|seek|shuffle|repeat|volup|voldown|mute|unmute|volumeset -Target Spotify -Value 50
param(
  [string]$Action = 'playpause',
  [string]$Target = '',
  [string]$Value = ''
)
$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CM {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@

$WM_APPCOMMAND = 0x0319

# MSDN APPCOMMAND values
$commands = @{
  'next'      = 0xB1
  'prev'      = 0xB0
  'playpause' = 0xB3
  'stop'      = 0xB2
}

# Virtual-key codes for transport + volume. These are what real media keys send,
# so Windows routes them to whichever app owns the active media session.
$vkeys = @{
  'next'      = 0xB0
  'prev'      = 0xB1
  'playpause' = 0xB3
  'stop'      = 0xB2
  'volup'   = 0xAF
  'voldown' = 0xAE
  'mute'    = 0xAD
}

$sent = $false
$action = $Action.ToLower().Trim()

function Invoke-Smtc([string]$op, [long]$num) {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]
    if (-not $asTask) { return $false }
    $reqOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $t = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @($reqOp))
    $mgr = $t.GetAwaiter().GetResult()
    if ($null -eq $mgr) { return $false }
    $sess = $null
    try { $sess = $mgr.GetCurrentSession() } catch { $sess = $null }
    if ($null -eq $sess) {
      try {
        foreach ($s in $mgr.GetSessions()) {
          try {
            $st = [int]$s.GetPlaybackInfo().PlaybackStatus
            if ($st -eq 4 -or $st -eq 5) { $sess = $s; break }
          } catch { }
        }
      } catch { }
    }
    if ($null -eq $sess) { return $false }
    $boolTask = $asTask.MakeGenericMethod([bool])
    switch ($op) {
      'play' {
        $o = $sess.TryPlayAsync(); $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'pause' {
        $o = $sess.TryPauseAsync(); $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'next' {
        $o = $sess.TrySkipToNextAsync(); $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'prev' {
        $o = $sess.TrySkipToPreviousAsync(); $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'playpause' {
        $st = [int]$sess.GetPlaybackInfo().PlaybackStatus
        if ($st -eq 4) { $o = $sess.TryPauseAsync() } else { $o = $sess.TryPlayAsync() }
        $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'shuffle' {
        $o = $sess.TryToggleShuffleAsync(); $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'repeat' {
        try {
          $cur = [int]$sess.GetPlaybackInfo().AutoRepeatMode
          $nextMode = 0
          if ($cur -eq 0) { $nextMode = 1 } elseif ($cur -eq 1) { $nextMode = 2 } else { $nextMode = 0 }
          $mode = [Windows.Media.MediaPlaybackAutoRepeatMode]$nextMode
          $o = $sess.TryChangeAutoRepeatModeAsync($mode)
          $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
        } catch { return $false }
      }
      'seekfwd' {
        $delta = $num; if ($delta -le 0) { $delta = 10 }
        $tl = $sess.GetTimelineProperties()
        $cur = [long]$tl.Position.Ticks; $end = [long]$tl.EndTime.Ticks
        $want = $cur + $delta * 10000000
        if ($end -gt 0 -and $want -gt $end) { $want = $end - 5000000 }
        if ($want -lt 0) { $want = 0 }
        $o = $sess.TryChangePlaybackPositionAsync($want)
        $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'seekback' {
        $delta = $num; if ($delta -le 0) { $delta = 10 }
        $tl = $sess.GetTimelineProperties()
        $cur = [long]$tl.Position.Ticks
        $want = $cur - $delta * 10000000
        if ($want -lt 0) { $want = 0 }
        $o = $sess.TryChangePlaybackPositionAsync($want)
        $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
      'seek' {
        $want = $num * 10000000
        if ($want -lt 0) { $want = 0 }
        try {
          $end = [long]$sess.GetTimelineProperties().EndTime.Ticks
          if ($end -gt 0 -and $want -gt $end) { $want = $end - 5000000 }
        } catch { }
        $o = $sess.TryChangePlaybackPositionAsync([long]$want)
        $r = $boolTask.Invoke($null, @($o)).GetAwaiter().GetResult(); return [bool]$r
      }
    }
    return $false
  } catch {
    return $false
  }
}

function Set-SystemVolume([string]$raw) {
  try {
    $n = 0
    if (-not [int]::TryParse($raw, [ref]$n)) { return $null }
    if ($n -lt 0) { $n = 0 }
    if ($n -gt 100) { $n = 100 }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class HoneyVolCtl {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  private class _MMEnumerator { }
  private enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
  private enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out IntPtr ppDevices);
    [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
    [PreserveSig] int GetDevice(string pwstrId, out IMMDevice ppDevice);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr pClient);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr pClient);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
    [PreserveSig] int OpenPropertyStore(uint stgmAccess, out IntPtr ppProperties);
    [PreserveSig] int GetId(out IntPtr ppstrId);
    [PreserveSig] int GetState(out uint pdwState);
  }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr pNotify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr pNotify);
    [PreserveSig] int GetChannelCount(out uint pnChannelCount);
    [PreserveSig] int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    [PreserveSig] int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    [PreserveSig] int GetMasterVolumeLevel(out float pfLevelDB);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float pfLevel);
    [PreserveSig] int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    [PreserveSig] int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    [PreserveSig] int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    [PreserveSig] int VolumeStepUp(ref Guid pguidEventContext);
    [PreserveSig] int VolumeStepDown(ref Guid pguidEventContext);
  }
  static Guid _zero = Guid.Empty;
  static IAudioEndpointVolume Endpoint() {
    var en = (IMMDeviceEnumerator)(new _MMEnumerator());
    IMMDevice dev; en.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out dev);
    Guid iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    IAudioEndpointVolume ep; dev.Activate(ref iid, 23, IntPtr.Zero, out ep);
    return ep;
  }
  public static void Set(float v) { Endpoint().SetMasterVolumeLevelScalar(v, ref _zero); }
  public static void SetMute(bool m) { Endpoint().SetMute(m, ref _zero); }
}
'@ -ErrorAction Stop | Out-Null
    [HoneyVolCtl]::SetMute($false)
    [HoneyVolCtl]::Set([float]($n / 100.0))
    return $n
  } catch {
    return $null
  }
}

function Set-SystemMute([bool]$m) {
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class HoneyMuteCtl {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  private class _MMEnumerator { }
  private enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
  private enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out IntPtr ppDevices);
    [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
    [PreserveSig] int GetDevice(string pwstrId, out IMMDevice ppDevice);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr pClient);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr pClient);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
    [PreserveSig] int OpenPropertyStore(uint stgmAccess, out IntPtr ppProperties);
    [PreserveSig] int GetId(out IntPtr ppstrId);
    [PreserveSig] int GetState(out uint pdwState);
  }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr pNotify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr pNotify);
    [PreserveSig] int GetChannelCount(out uint pnChannelCount);
    [PreserveSig] int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    [PreserveSig] int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    [PreserveSig] int GetMasterVolumeLevel(out float pfLevelDB);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float pfLevel);
    [PreserveSig] int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    [PreserveSig] int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    [PreserveSig] int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    [PreserveSig] int VolumeStepUp(ref Guid pguidEventContext);
    [PreserveSig] int VolumeStepDown(ref Guid pguidEventContext);
  }
  static Guid _zero = Guid.Empty;
  public static void SetMute(bool m) {
    var en = (IMMDeviceEnumerator)(new _MMEnumerator());
    IMMDevice dev; en.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out dev);
    Guid iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    IAudioEndpointVolume ep; dev.Activate(ref iid, 23, IntPtr.Zero, out ep);
    ep.SetMute(m, ref _zero);
  }
}
'@ -ErrorAction Stop | Out-Null
    [HoneyMuteCtl]::SetMute($m) | Out-Null
    return $true
  } catch {
    return $false
  }
}

$numVal = 0
[long]$numLong = 0
try { $numLong = [long]([int]$Value) } catch { $numLong = 0 }

switch ($action) {
  'play'     { if (Invoke-Smtc 'play' 0) { $sent = $true } }
  'pause'    { if (Invoke-Smtc 'pause' 0) { $sent = $true } }
  'shuffle'  { if (Invoke-Smtc 'shuffle' 0) { $sent = $true } }
  'repeat'   { if (Invoke-Smtc 'repeat' 0) { $sent = $true } }
  'seekfwd'  { if (Invoke-Smtc 'seekfwd' $numLong) { $sent = $true } }
  'seekback' { if (Invoke-Smtc 'seekback' $numLong) { $sent = $true } }
  'seek'     { if (Invoke-Smtc 'seek' $numLong) { $sent = $true } }
  'volumeset' {
    $applied = Set-SystemVolume $Value
    if ($null -ne $applied) { $sent = $true; Write-Output "VOLUME=$applied" }
  }
  'unmute' {
    if (Set-SystemMute $false) { $sent = $true }
    else {
      $vk = $vkeys['mute']
      [CM]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
      [CM]::keybd_event($vk, 0, 2, [UIntPtr]::Zero)
      $sent = $true
    }
  }
  'mute' {
    # Prefer precise CoreAudio mute; fall back to the toggle key.
    if (Set-SystemMute $true) { $sent = $true }
  }
}

if ($vkeys.ContainsKey($action)) {
  $vk = $vkeys[$action]
  # 'mute' already handled precisely above; keep key as fallback only if SMTC path failed.
  if ($action -ne 'mute' -or -not $sent) {
    [CM]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
    [CM]::keybd_event($vk, 0, 2, [UIntPtr]::Zero)
    $sent = $true
  }
}

# Belt and braces: also post the app-command to the media window and foreground.
if ($commands.ContainsKey($action)) {
  $cmd = $commands[$action]
  $targets = @()

  if ($Target) {
    $p = Get-Process -Name $Target -ErrorAction SilentlyContinue |
         Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($p) { $targets += $p.MainWindowHandle }
  }

  foreach ($name in @('spotify', 'chrome', 'msedge', 'vlc', 'wmplayer')) {
    if ($targets.Count -gt 0) { break }
    $p = Get-Process -Name $name -ErrorAction SilentlyContinue |
         Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($p) { $targets += $p.MainWindowHandle }
  }
  $fg = [CM]::GetForegroundWindow()
  if ($fg -ne [IntPtr]::Zero) { $targets += $fg }

  foreach ($h in $targets) {
    [CM]::PostMessage($h, $WM_APPCOMMAND, $h, [IntPtr]$cmd) | Out-Null
    $sent = $true
  }
}

if ($sent) { Write-Output 'SENT' } else { Write-Output 'FAILED' }
exit 0
