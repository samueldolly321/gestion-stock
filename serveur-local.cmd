@echo off
REM ============================================================
REM  Vokatra-ko — Lancement du SERVEUR LOCAL (reseau local)
REM  Double-clique ce fichier sur le PC serveur pour demarrer.
REM  Laisse la fenetre OUVERTE : le serveur tourne dedans.
REM ============================================================
cd /d "%~dp0"

REM Construit l'interface au premier lancement (si pas encore fait).
if not exist "dist\index.html" (
  echo.
  echo Premiere utilisation : construction de l'interface (patiente un peu)...
  call npm run build
)

echo.
echo === Serveur Vokatra-ko en cours de demarrage ===
echo Les autres postes se connectent via http://ADRESSE-IP-DE-CE-PC:3001
echo (Ferme cette fenetre pour arreter le serveur.)
echo.
call npm start
pause
