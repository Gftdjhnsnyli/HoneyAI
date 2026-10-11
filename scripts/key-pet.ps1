# Keys edge-connected near-white background to transparent.
# Usage: powershell -File scripts/key-pet.ps1 [-Input assets/stu.png] [-Output assets/pet.png]
param(
  [string]$InFile = 'assets/stu.png',
  [string]$OutFile = 'assets/pet.png',
  [int]$FillTol = 225,
  [int]$HaloTol = 200
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$csharp = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Keyer {
  public static double KeyWhite(string input, string output, int fillTol, int haloTol) {
    using (var src = new Bitmap(input)) {
      int w = src.Width, h = src.Height;
      using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
        using (var g = Graphics.FromImage(bmp)) { g.DrawImage(src, 0, 0, w, h); }
        var rect = new Rectangle(0, 0, w, h);
        var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        try {
          int n = w * h;
          var px = new byte[n * 4];
          Marshal.Copy(data.Scan0, px, 0, px.Length);
          var cleared = new bool[n];
          var seen = new bool[n];
          var stack = new Stack<int>();
          for (int x = 0; x < w; x++) { stack.Push(x); stack.Push((h - 1) * w + x); }
          for (int y = 0; y < h; y++) { stack.Push(y * w); stack.Push(y * w + w - 1); }
          while (stack.Count > 0) {
            int i = stack.Pop();
            int x = i % w, y = i / w;
            if (x < 0 || y < 0 || x >= w || y >= h || seen[i]) continue;
            seen[i] = true;
            int o = i * 4;
            int m = Math.Min(px[o], Math.Min(px[o + 1], px[o + 2]));
            if (m < fillTol) continue;
            cleared[i] = true;
            if (x > 0) stack.Push(i - 1);
            if (x < w - 1) stack.Push(i + 1);
            if (y > 0) stack.Push(i - w);
            if (y < h - 1) stack.Push(i + w);
          }
          for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int i = y * w + x;
            if (cleared[i]) continue;
            bool touches = (x > 0 && cleared[i - 1]) || (x < w - 1 && cleared[i + 1]) ||
                           (y > 0 && cleared[i - w]) || (y < h - 1 && cleared[i + w]);
            if (!touches) continue;
            int o = i * 4;
            int m = Math.Min(px[o], Math.Min(px[o + 1], px[o + 2]));
            if (m >= haloTol) cleared[i] = true;
          }
          long count = 0;
          for (int i = 0; i < n; i++) {
            if (cleared[i]) { px[i * 4 + 3] = 0; count++; }
          }
          Marshal.Copy(px, 0, data.Scan0, px.Length);
          bmp.UnlockBits(data);
          data = null;
          bmp.Save(output, ImageFormat.Png);
          return (double)count / n;
        } finally {
          if (data != null) bmp.UnlockBits(data);
        }
      }
    }
  }
}
'@
Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$inFile = if ([IO.Path]::IsPathRooted($InFile)) { $InFile } else { Join-Path $root $InFile }
$outFile = if ([IO.Path]::IsPathRooted($OutFile)) { $OutFile } else { Join-Path $root $OutFile }
$img = [Drawing.Image]::FromFile($inFile)
Write-Output ('input: {0}x{1} {2}' -f $img.Width, $img.Height, $img.PixelFormat)
$img.Dispose()
$ratio = [Keyer]::KeyWhite($inFile, $outFile, $FillTol, $HaloTol)
Write-Output ('wrote {0} ({1:P1} transparent)' -f $outFile, $ratio)
