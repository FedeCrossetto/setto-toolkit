Add-Type -AssemblyName System.Drawing

$size   = 256
$bmp    = New-Object System.Drawing.Bitmap($size, $size)
$g      = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# ── Background: solid black ────────────────────────────────────────────
$g.Clear([System.Drawing.Color]::Black)

# ── Two diagonal bars (SVG viewBox 0 0 36 36, scaled to 256) ───────────
$scale   = $size / 36.0
$strokeW = [float](5.0 * $scale)
$lineColor = [System.Drawing.Color]::White
$pen = New-Object System.Drawing.Pen($lineColor, $strokeW)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round

# Line 1: x1=10.5 y1=30  x2=18.5 y2=6
$g.DrawLine($pen, [float](10.5 * $scale), [float](30.0 * $scale), [float](18.5 * $scale), [float](6.0 * $scale))
# Line 2: x1=20.5 y1=30  x2=28.5 y2=6
$g.DrawLine($pen, [float](20.5 * $scale), [float](30.0 * $scale), [float](28.5 * $scale), [float](6.0 * $scale))

$pen.Dispose()
$g.Dispose()

# ── Save PNG ────────────────────────────────────────────────────────────
$pngPath = Join-Path $PSScriptRoot "..\public\dev-logo.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "PNG saved -> $pngPath"

# ── Wrap PNG inside modern ICO container ───────────────────────────────
# Modern ICO (Vista+) supports PNG payloads directly
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$pngLen   = $pngBytes.Length
$dataOffset = 22   # 6 (ICONDIR) + 16 (ICONDIRENTRY)

$ms = New-Object System.IO.MemoryStream

# ICONDIR  (reserved=0, type=1, count=1)
$ms.Write([byte[]](0, 0, 1, 0, 1, 0), 0, 6)

# ICONDIRENTRY (width=0=>256, height=0=>256, colorCount=0, reserved=0, planes=1, bitCount=32, size, offset)
$ms.Write([byte[]](0, 0, 0, 0, 1, 0, 32, 0), 0, 8)
$ms.Write([System.BitConverter]::GetBytes([int32]$pngLen),    0, 4)
$ms.Write([System.BitConverter]::GetBytes([int32]$dataOffset), 0, 4)

# PNG payload
$ms.Write($pngBytes, 0, $pngLen)

$icoPath = Join-Path $PSScriptRoot "..\public\dev-logo.ico"
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$ms.Dispose()
Write-Host "ICO saved -> $icoPath"
