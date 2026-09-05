@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在转换地图与技能范围数据...
node "%~dp0tools\convert.js"
echo.
echo 转换完成！重新打开 index.html 即可看到最新数据。
pause
