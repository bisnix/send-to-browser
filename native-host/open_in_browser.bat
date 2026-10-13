@echo off
rem Windows wrapper: Chrome needs an executable as the native host "path".
rem install.ps1 rewrites "python" below to an absolute interpreter path.
"python" "%~dp0open_in_browser.py" %*
