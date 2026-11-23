@echo off
rem Vokatra-ko : ouvre la fenetre du generateur de licences (scripts\generateur-licence.ps1).
rem En ligne de commande : node scripts\licence.mjs generer <CODE-MACHINE> "<Nom du client>"
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\generateur-licence.ps1"
