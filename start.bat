@echo off
:: 爪爪桌宠启动脚本
:: 双击此文件即可启动桌宠
:: 如果启动失败，尝试右键 → 使用 PowerShell 运行 start.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

