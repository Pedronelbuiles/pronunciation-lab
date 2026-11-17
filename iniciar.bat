@echo off
cd /d "%~dp0"
where py >nul 2>nul && (py serve.py & goto :eof)
where python >nul 2>nul && (python serve.py & goto :eof)
echo No encontre Python. Instalalo desde https://www.python.org/downloads/ (marca "Add python.exe to PATH") y vuelve a abrir este archivo.
pause
