@echo off
set "PATH=%LOCALAPPDATA%\PortableGit\cmd;%PATH%"
echo ========================================================
echo  Farm Fresh Chocolate Milk - GitHub Deploy Script
echo ========================================================
echo Target Repository: https://github.com/liro7569-del/Farm-Fresh-Milk.git
echo.
git push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo  SUCCESS: All files pushed to GitHub successfully!
    echo ========================================================
) else (
    echo ========================================================
    echo  Push failed or authorization required.
    echo ========================================================
)
pause
