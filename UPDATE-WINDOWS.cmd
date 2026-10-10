@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Обновление CRM Линия
echo.
echo Закройте окно запуска CRM перед обновлением.
echo В следующем окне выберите ПРЕЖНЮЮ папку вашей студии.
echo Данные и настройки сохранятся. Будет создана резервная копия.
echo.
where node >nul 2>nul
if errorlevel 1 goto need_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto need_node
node scripts\update-windows.mjs
if errorlevel 1 goto failed
pause
exit /b 0
:need_node
echo Установите Node.js версии 24 или новее с nodejs.org.
pause
exit /b 1
:failed
echo.
echo Обновление не завершено. Сохраните текст ошибки выше.
pause
exit /b 1
