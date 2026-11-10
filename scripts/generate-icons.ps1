# Genera los iconos PNG de la PWA con System.Drawing (Windows).
# Uso: powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

$colorStart = [System.Drawing.Color]::FromArgb(99, 102, 241)
$colorEnd = [System.Drawing.Color]::FromArgb(67, 56, 202)
$white = [System.Drawing.Color]::White

function New-RoundedRectPath {
    param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $R * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon {
    param(
        [int]$Size,
        [string]$Path,
        [bool]$Maskable = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $colorStart, $colorEnd, [single]45)

    if ($Maskable) {
        $graphics.FillRectangle($brush, $rect)
    }
    else {
        $radius = $Size * 0.22
        $shape = New-RoundedRectPath 0 0 $Size $Size $radius
        $graphics.FillPath($brush, $shape)
        $shape.Dispose()
    }

    $cx = $Size / 2.0
    $cy = $Size / 2.0

    if ($Maskable) {
        $lineLength = $Size * 0.45
        $lineWidth = $Size * 0.07
        $dotDiameter = $Size * 0.115
        $gap = $Size * 0.135
    }
    else {
        $lineLength = $Size * 0.52
        $lineWidth = $Size * 0.08
        $dotDiameter = $Size * 0.15
        $gap = $Size * 0.165
    }

    $dotRadius = $dotDiameter / 2.0
    $pen = New-Object System.Drawing.Pen($white, [single]$lineWidth)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($pen, [single]($cx - $lineLength / 2), [single]$cy, [single]($cx + $lineLength / 2), [single]$cy)

    $dotBrush = New-Object System.Drawing.SolidBrush($white)
    $graphics.FillEllipse($dotBrush, [single]($cx - $dotRadius), [single]($cy - $gap - $dotRadius), [single]$dotDiameter, [single]$dotDiameter)
    $graphics.FillEllipse($dotBrush, [single]($cx - $dotRadius), [single]($cy + $gap - $dotRadius), [single]$dotDiameter, [single]$dotDiameter)

    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $pen.Dispose()
    $dotBrush.Dispose()
    $brush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

function Resize-Png {
    param([string]$Source, [string]$Destination, [int]$Size)
    $image = [System.Drawing.Image]::FromFile($Source)
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($image, 0, 0, $Size, $Size)
    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    $image.Dispose()
}

New-Icon -Size 512 -Path (Join-Path $iconsDir 'icon-512.png')
New-Icon -Size 192 -Path (Join-Path $iconsDir 'icon-192.png')
New-Icon -Size 512 -Path (Join-Path $iconsDir 'icon-maskable-512.png') -Maskable $true
New-Icon -Size 180 -Path (Join-Path $iconsDir 'apple-touch-icon.png')

Resize-Png -Source (Join-Path $iconsDir 'icon-192.png') -Destination (Join-Path $iconsDir 'favicon-32.png') -Size 32

# ICO que contiene el PNG de 32x32 (formato aceptado por navegadores modernos).
$pngBytes = [System.IO.File]::ReadAllBytes((Join-Path $iconsDir 'favicon-32.png'))
$icoPath = Join-Path $iconsDir 'favicon.ico'
$stream = [System.IO.File]::Create($icoPath)
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([Byte]32)
$writer.Write([Byte]32)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Close()

$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Divisor de Gastos">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <line x1="123" y1="256" x2="389" y2="256" stroke="#fff" stroke-width="41" stroke-linecap="round"/>
  <circle cx="256" cy="171" r="38" fill="#fff"/>
  <circle cx="256" cy="341" r="38" fill="#fff"/>
</svg>
'@

[System.IO.File]::WriteAllText((Join-Path $iconsDir 'icon.svg'), $svg, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Iconos generados en $iconsDir"
Get-ChildItem $iconsDir | Select-Object Name, Length | Format-Table -AutoSize
