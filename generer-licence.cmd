@echo off
chcp 65001 >nul
title Vokatra-ko - Generer une licence
cd /d "%~dp0"
echo.
echo  === Vokatra-ko : creation d'une cle de licence (a vie) ===
echo.
echo  Le client lit son "code machine" sur l'ecran d'activation de l'application.
echo.
set /p CODE= Code machine du client (ex. 1A2B-3C4D-5E6F-7A8B) :
set /p CLIENT= Nom du client (magasin) :
echo.
node scripts\licence.mjs generer "%CODE%" "%CLIENT%"
echo.
pause
