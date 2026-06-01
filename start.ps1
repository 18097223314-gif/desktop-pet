# 爪爪桌宠启动脚本
# 必须完全移除 ELECTRON_RUN_AS_NODE，否则 require('electron') 返回字符串而非 API
# 注意：设空字符串不够，必须 Remove-Item 彻底删除
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$electronExe = Join-Path $scriptDir 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electronExe)) {
    Write-Host "[ERROR] electron.exe not found: $electronExe"
    exit 1
}
Start-Process $electronExe -ArgumentList '.' -WorkingDirectory $scriptDir
