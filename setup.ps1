# ============================================================
# 研究报告底稿工具 - 安装脚本
# 功能：安装 ExcelJS 依赖 + 生成扩展图标
# 用法：在 PowerShell 中运行 .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $root) { $root = Get-Location }

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  研究报告底稿工具 - 安装向导" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. 创建目录 ----------
Write-Host "[1/3] 创建项目目录..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path (Join-Path $root "lib") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root "icons") | Out-Null
Write-Host "      目录已就绪" -ForegroundColor Green

# ---------- 2. 安装 ExcelJS ----------
Write-Host "[2/3] 安装 ExcelJS 依赖..." -ForegroundColor Yellow

# 初始化 package.json（如果不存在）
$pkgPath = Join-Path $root "package.json"
if (-not (Test-Path $pkgPath)) {
    $pkg = @{
        name = "research-report-extension"
        version = "1.0.0"
        private = $true
        description = "研究报告底稿 Chrome 扩展（开发依赖）"
    } | ConvertTo-Json -Depth 3
    Set-Content -Path $pkgPath -Value $pkg -Encoding UTF8
    Write-Host "      已创建 package.json" -ForegroundColor Green
}

# 安装 exceljs
Push-Location $root
try {
    npm install exceljs --save
    if ($LASTEXITCODE -ne 0) {
        throw "npm install 失败，请确保已安装 Node.js (https://nodejs.org)"
    }
} finally {
    Pop-Location
}

# Verify exceljs min file exists
$bundlePath = Join-Path (Join-Path (Join-Path $root "node_modules") "exceljs") "dist"
$bundleFile = Join-Path $bundlePath "exceljs.min.js"
if (-not (Test-Path $bundleFile)) {
    throw "Cannot find ExcelJS bundle at: $bundleFile"
}

Write-Host "      ExcelJS installed: $bundleFile" -ForegroundColor Green

# ---------- 3. 生成图标 ----------
Write-Host "[3/3] 生成扩展图标..." -ForegroundColor Yellow

$iconsDir = Join-Path $root "icons"

# 使用 System.Drawing 生成简洁的图标
Add-Type -AssemblyName System.Drawing

foreach ($size in @(16, 48, 128)) {
    $filePath = Join-Path $iconsDir "icon$size.png"

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "AntiAlias"
    $g.Clear([System.Drawing.Color]::Transparent)

    # 绘制蓝色圆角背景
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(59, 80, 201))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
    $bgBrush.Dispose()

    # 绘制文档图标（白色矩形）
    $docMargin = [int]($size * 0.18)
    $docWidth = [int]($size * 0.42)
    $docHeight = [int]($size * 0.6)
    $docX = [int]($size * 0.2)
    $docY = [int]($size * 0.12)
    $docBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 240))
    $g.FillRectangle($docBrush, $docX, $docY, $docWidth, $docHeight)
    $docBrush.Dispose()

    # 绘制文档上的线条
    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(59, 80, 201, 60), [Math]::Max(1, $size * 0.03))
    for ($li = 0; $li -lt 3; $li++) {
        $ly = $docY + [int]($docHeight * 0.25) + [int]($li * $docHeight * 0.18)
        $lw = [int]($docWidth * (0.7 - $li * 0.1))
        $g.DrawLine($linePen, $docX + [int]($docWidth * 0.15), $ly, $docX + [int]($docWidth * 0.15) + $lw, $ly)
    }
    $linePen.Dispose()

    # 绘制绿色相机圆形
    $camR = [int]($size * 0.22)
    $camCX = [int]($size * 0.62)
    $camCY = [int]($size * 0.65)
    $camBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(16, 185, 129))
    $g.FillEllipse($camBrush, $camCX - $camR, $camCY - $camR, $camR * 2, $camR * 2)
    $camBrush.Dispose()

    # 相机内部白色圆
    $innerR = [int]($camR * 0.6)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, $camCX - $innerR, $camCY - $innerR, $innerR * 2, $innerR * 2)
    $whiteBrush.Dispose()

    $g.Dispose()
    $bmp.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host "      icon${size}.png generated" -ForegroundColor Green
}

# ---------- 完成 ----------
Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "后续步骤：" -ForegroundColor Cyan
Write-Host "  1. 打开 Chrome 浏览器，访问 chrome://extensions/" -ForegroundColor White
Write-Host "  2. 开启右上角「开发者模式」" -ForegroundColor White
Write-Host "  3. 点击「加载已解压的扩展程序」" -ForegroundColor White
Write-Host "  4. Select this folder: $root" -ForegroundColor White
Write-Host ""
