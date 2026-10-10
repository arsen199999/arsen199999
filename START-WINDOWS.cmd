@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Линия — CRM студии растяжки

echo.
echo  ЛИНИЯ — CRM студии растяжки
echo  Это окно нужно оставить открытым, пока вы работаете в CRM.
echo.

where node >nul 2>nul
if errorlevel 1 goto need_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto need_node
where npm >nul 2>nul
if errorlevel 1 goto need_node

if not exist "node_modules\vite\bin\vite.js" goto install
if not exist "node_modules\express\package.json" goto install
goto build

:install
echo  Первый запуск: скачиваем необходимые компоненты.
echo  Пожалуйста, дождитесь завершения. Нужен доступ к интернету.
echo.
call npm ci --include=dev --no-audit --no-fund
if errorlevel 1 goto failed

:build
if exist "dist\index.html" goto launch
echo.
echo  Готовим интерфейс CRM...
call npm run build
if errorlevel 1 goto failed

:launch
echo.
echo  Запускаем студию. Браузер откроется автоматически.
node scripts\open-studio.mjs
if errorlevel 1 goto failed
exit /b 0

:need_node
echo  Сначала установите Node.js версии 24 или новее.
echo  Сейчас откроется официальный сайт Node.js.
echo  Выберите установщик для Windows, установите его с обычными настройками.
echo  После установки закройте это окно и снова откройте START-WINDOWS.cmd.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:failed
echo.
echo  Запуск не завершён. Текст ошибки находится выше.
echo  Если порт 3000 уже занят, закройте предыдущее окно запуска CRM.
echo  Если не удалось скачать компоненты, проверьте подключение к интернету.
echo  Скопируйте текст ошибки в чат, если нужна помощь.
echo.
pause
exit /b 1
