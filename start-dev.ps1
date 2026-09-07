$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$serverDir = Join-Path $root 'server'
$webDir    = Join-Path $root 'web'

# .env 仅在缺失时从模板生成，绝不覆盖已有真实配置（JWT/加密密钥/SSO 等）
$serverEnv = Join-Path $serverDir '.env'
if (-not (Test-Path $serverEnv)) {
    Copy-Item (Join-Path $serverDir '.env.example') $serverEnv
    Write-Host "已从 .env.example 生成 server/.env" -ForegroundColor Yellow
}

# 依赖仅在未安装时安装，避免每次启动重复 npm install
if (-not (Test-Path (Join-Path $serverDir 'node_modules'))) {
    Write-Host "安装后端依赖 ..." -ForegroundColor Yellow
    Push-Location $serverDir
    npm install
    Pop-Location
}
if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-Host "安装前端依赖 ..." -ForegroundColor Yellow
    Push-Location $webDir
    npm install
    Pop-Location
}

Write-Host "启动后端 (http://localhost:3000) ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$serverDir'; npm run start:dev"

Start-Sleep -Seconds 2
Write-Host "启动前端 (http://localhost:5173) ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$webDir'; npm run dev"

Write-Host "已在两个新窗口分别启动后端与前端。" -ForegroundColor Green
Write-Host "前端: http://localhost:5173  账号: admin / admin123" -ForegroundColor Green
