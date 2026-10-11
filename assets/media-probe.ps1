# Honey media probe v2. Prints CURRENT/TITLE/ARTIST/ALBUM/APP/STATE/POS/DUR/SHUFFLE/REPEAT/VOLUME/MUTE or NONE.
# Strategy: Windows SMTC (accurate title/state/position) first, legacy window-title fallback second.
# Works on plain Windows PowerShell 5.1 (no WinRT), no admin needed.
$ErrorActionPreference = 'SilentlyContinue'
$OutputEncoding = [System.Text.Encoding]::UTF8

function Get-VolumeInfo {
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class HoneyVolProbe {
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
  public static float Get() { float v; Endpoint().GetMasterVolumeLevelScalar(out v); return v; }
  public static bool GetMute() { bool m; Endpoint().GetMute(out m); return m; }
}
'@ -ErrorAction Stop | Out-Null
    $v = [HoneyVolProbe]::Get()
    $m = [HoneyVolProbe]::GetMute()
    return @{ volume = [int][Math]::Round($v * 100); muted = $m }
  } catch {
    return $null
  }
}

function Get-SmtcInfo {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]
    if (-not $asTaskGeneric) { return $null }
    $op = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $t1 = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @($op))
    $mgr = $t1.GetAwaiter().GetResult()
    if ($null -eq $mgr) { return $null }
    $sess = $null
    try { $sess = $mgr.GetCurrentSession() } catch { $sess = $null }
    if ($null -eq $sess) {
      # Multiple sessions: pick the first playing/paused one.
      try {
        foreach ($s in $mgr.GetSessions()) {
          try {
            $st = $s.GetPlaybackInfo().PlaybackStatus
            if ($st -eq 4 -or $st -eq 5) { $sess = $s; break }
          } catch { }
        }
      } catch { }
    }
    if ($null -eq $sess) { return $null }
    $pb = $sess.GetPlaybackInfo()
    $status = 0
    try { $status = [int]$pb.PlaybackStatus } catch { }
    # 4=Playing, 5=Paused. Anything else with no title is not worth reporting.
    $state = 'Stopped'
    if ($status -eq 4) { $state = 'Playing' }
    elseif ($status -eq 5) { $state = 'Paused' }

    $pos = 0; $dur = 0
    try {
      $tl = $sess.GetTimelineProperties()
      $pos = [int]$tl.Position.TotalSeconds
      $dur = [int]$tl.EndTime.TotalSeconds
      if ($pos -lt 0) { $pos = 0 }
      if ($dur -lt 0) { $dur = 0 }
    } catch { }

    $title = ''; $artist = ''; $album = ''
    try {
      $mop = $sess.TryGetMediaPropertiesAsync()
      $t2 = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionProperties]).Invoke($null, @($mop))
      $props = $t2.GetAwaiter().GetResult()
      $title = [string]$props.Title
      $artist = [string]$props.Artist
      $album = [string]$props.AlbumTitle
    } catch { }
    if (-not $title) { return $null }

    $appId = ''
    try { $appId = [string]$sess.SourceAppUserModelId } catch { }
    $app = 'Media'
    if ($appId) {
      $low = $appId.ToLower()
      if ($low.Contains('spotify')) { $app = 'Spotify' }
      elseif ($low.Contains('chrome')) { $app = 'Chrome' }
      elseif ($low.Contains('msedge') -or $low.Contains('edge')) { $app = 'Edge' }
      elseif ($low.Contains('firefox')) { $app = 'Firefox' }
      elseif ($low.Contains('vlc')) { $app = 'VLC' }
      elseif ($low.Contains('aimp')) { $app = 'AIMP' }
      else {
        # "Spotify.exe", "chrome.exe" -> "Spotify", "Chrome"
        $base = ($appId -split '[!\\.]')[0]
        if ($base) { $app = $base.Substring(0,1).ToUpper() + $base.Substring(1).ToLower() }
      }
    }

    $shuffle = ''
    try {
      $sv = $pb.IsShuffleActive
      if ($null -ne $sv) { $shuffle = if ($sv) { 'On' } else { 'Off' } }
    } catch { }
    $repeat = ''
    try {
      # AutoRepeatMode: 0=None 1=List 2=Track
      $rm = [int]$pb.AutoRepeatMode
      if ($rm -eq 2) { $repeat = 'One' } elseif ($rm -eq 1) { $repeat = 'All' } else { $repeat = 'Off' }
    } catch { }

    if ($title.Length -gt 90) { $title = $title.Substring(0, 90) }
    if ($artist.Length -gt 60) { $artist = $artist.Substring(0, 60) }
    if ($album.Length -gt 60) { $album = $album.Substring(0, 60) }
    return @{
      app = $app; title = $title.Trim(); artist = $artist.Trim(); album = $album.Trim();
      state = $state; pos = $pos; dur = $dur; shuffle = $shuffle; repeat = $repeat
    }
  } catch {
    return $null
  }
}

$vol = Get-VolumeInfo
$info = Get-SmtcInfo

if ($info -and $info.title) {
  Write-Output 'CURRENT'
  Write-Output "APP=$($info.app)"
  Write-Output "TITLE=$($info.title)"
  Write-Output "ARTIST=$($info.artist)"
  Write-Output "ALBUM=$($info.album)"
  Write-Output "STATE=$($info.state)"
  Write-Output "POS=$($info.pos)"
  Write-Output "DUR=$($info.dur)"
  if ($info.shuffle) { Write-Output "SHUFFLE=$($info.shuffle)" }
  if ($info.repeat) { Write-Output "REPEAT=$($info.repeat)" }
  if ($vol) {
    Write-Output "VOLUME=$($vol.volume)"
    Write-Output "MUTE=$(if ($vol.muted) { '1' } else { '0' })"
  }
  exit 0
}

# --- Legacy fallback: window-title probe (same behavior as v1.1.0) ---
$players = @(
  @{ proc = 'spotify';            app = 'Spotify' },
  @{ proc = 'chrome';             app = 'Chrome' },
  @{ proc = 'msedge';             app = 'Edge' },
  @{ proc = 'firefox';            app = 'Firefox' },
  @{ proc = 'vlc';                app = 'VLC' },
  @{ proc = 'wmplayer';           app = 'Media Player' },
  @{ proc = 'AIMP';               app = 'AIMP' },
  @{ proc = 'ApplicationFrameHost'; app = 'Media App' }
)

$tails = @(
  ' - Google Chrome', ' - Microsoft Edge', ' - Mozilla Firefox',
  ' - YouTube', ' - Spotify', ' - VLC media player'
)

$found = $null
$browsers = @('chrome', 'msedge', 'firefox')
$mediaMarks = @('youtube', 'youtu.be', 'spotify', 'soundcloud', 'music', 'video', 'radio', 'podcast', 'twitch', 'netflix', 'mixcloud', 'bandcamp', 'audius', 'deezer', 'tidal', 'pandora', 'vimeo')
foreach ($p in $players) {
  $proc = Get-Process -Name $p.proc -ErrorAction SilentlyContinue |
          Where-Object { $_.MainWindowTitle } |
          Select-Object -First 1
  if ($proc -and $proc.MainWindowTitle) {
    # Browsers: any web page has a title, so only count it as media when the
    # title actually looks like playback (kills GitHub-tab false positives).
    if ($browsers -contains $p.proc) {
      $raw = $proc.MainWindowTitle.ToLower()
      $isMedia = $false
      foreach ($m in $mediaMarks) { if ($raw.Contains($m)) { $isMedia = $true; break } }
      if (-not $isMedia) { continue }
    }
    $found = [pscustomobject]@{ App = $p.app; Title = $proc.MainWindowTitle }
    break
  }
}

if (-not $found) { Write-Output 'NONE'; exit 0 }

$title = $found.Title
foreach ($t in $tails) { $title = $title.Replace($t, '') }
$title = $title.Trim()
if (-not $title) { Write-Output 'NONE'; exit 0 }

$artist = ''
if ($title -match '^(.*?)\s+[-–—]\s+(.+)$') {
  $artist = $Matches[1].Trim()
  $title = $Matches[2].Trim()
}
if ($title.Length -gt 90) { $title = $title.Substring(0, 90) }
if ($artist.Length -gt 60) { $artist = $artist.Substring(0, 60) }

Write-Output 'CURRENT'
Write-Output "APP=$($found.App)"
Write-Output "TITLE=$title"
Write-Output "ARTIST=$artist"
Write-Output 'STATE=Playing'
if ($vol) {
  Write-Output "VOLUME=$($vol.volume)"
  Write-Output "MUTE=$(if ($vol.muted) { '1' } else { '0' })"
}
