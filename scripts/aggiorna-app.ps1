<#
  Aggiorna Vignetta installata con l'installer, partendo dai sorgenti di questo repository.

  Passi: controlli (typecheck e test) -> nuova versione (0.1.0 -> 0.1.1) -> chiusura gentile di Vignetta
  (salva la libreria) -> creazione dell'installer -> installazione silenziosa nella stessa cartella ->
  pulizia degli installer vecchi in dist\ -> riapertura se era aperta.
  Se qualcosa fallisce prima della fine dell'installazione, la versione torna quella di prima.
  Libreria, progressi, copertine e copie di sicurezza (%APPDATA%\Vignetta) non vengono toccati.

  Uso:  npm run aggiorna
        npm run aggiorna -- -SenzaTest     (salta typecheck e test)
        npm run aggiorna -- -Prova         (mostra cosa farebbe, senza chiudere né installare nulla)

  Compatibile con Windows PowerShell 5.1.
#>
param(
  [switch]$SenzaTest,
  [switch]$Prova
)

$ErrorActionPreference = 'Stop'
$progetto = Split-Path -Parent $PSScriptRoot
Set-Location $progetto

function Passo([string]$testo) { Write-Host "`n==> $testo" -ForegroundColor Cyan }

# Contenuto di package.json e package-lock.json prima di cambiare versione, per rimetterli se qualcosa va storto.
$script:versioneSalvata = $null
function Ripristina-Versione {
  if (-not $script:versioneSalvata) { return }
  foreach ($file in $script:versioneSalvata.Keys) { [IO.File]::WriteAllText($file, $script:versioneSalvata[$file], (New-Object Text.UTF8Encoding $false)) }
  $script:versioneSalvata = $null
  Write-Host 'Versione riportata a quella di prima.'
}

function Ferma([string]$testo) {
  Write-Host "`nAggiornamento interrotto: $testo" -ForegroundColor Red
  Ripristina-Versione
  exit 1
}

function Esegui-Npm([string]$comando) {
  & npm.cmd run $comando
  if ($LASTEXITCODE -ne 0) { Ferma "«npm run $comando» non è riuscito." }
}

# Dove è installata: dalla voce di disinstallazione registrata dall'installer (per utente o per tutti).
function Cartella-Installazione {
  $chiavi = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($chiave in $chiavi) {
    $voce = Get-ItemProperty $chiave -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Vignetta *' } | Select-Object -First 1
    if (-not $voce) { continue }
    $perTutti = $chiave.StartsWith('HKLM')
    if ($voce.InstallLocation) { return @{ Cartella = $voce.InstallLocation.TrimEnd('\'); PerTutti = $perTutti; Versione = $voce.DisplayVersion } }
    if ($voce.UninstallString -match '^"([^"]+)"') { return @{ Cartella = (Split-Path -Parent $Matches[1]); PerTutti = $perTutti; Versione = $voce.DisplayVersion } }
  }
  return $null
}

$installata = Cartella-Installazione
if (-not $installata) { Ferma 'Vignetta non risulta installata. La prima volta usa l''installer in dist\ (npm run installer).' }
if ($installata.PerTutti) { Ferma 'Vignetta è installata per tutti gli utenti: serve un aggiornamento come amministratore, non gestito da questo script.' }
$versioneAttuale = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Vignetta installata in: $($installata.Cartella) (versione $($installata.Versione))"

if (-not $SenzaTest) {
  Passo 'Controllo dei tipi e test'
  if ($Prova) { Write-Host '(prova) npm run typecheck, npm test' } else { Esegui-Npm 'typecheck'; Esegui-Npm 'test' }
}

# Ultima cifra +1 (0.1.0 -> 0.1.1): Impostazioni -> App mostra quale versione è installata.
Passo 'Nuova versione'
$parti = $versioneAttuale.Split('.')
$versione = "$($parti[0]).$($parti[1]).$([int]$parti[2] + 1)"
if ($Prova) { Write-Host "(prova) $versioneAttuale -> $versione" } else {
  $script:versioneSalvata = @{}
  foreach ($file in 'package.json', 'package-lock.json') { $percorso = Join-Path $progetto $file; $script:versioneSalvata[$percorso] = [IO.File]::ReadAllText($percorso) }
  & npm.cmd version $versione --no-git-tag-version | Out-Null
  if ($LASTEXITCODE -ne 0) { Ferma 'impossibile cambiare la versione.' }
  Write-Host "$versioneAttuale -> $versione"
}

# Chiusura gentile: come premere la X, così la libreria viene salvata. Non si forza mai la chiusura.
Passo 'Chiusura di Vignetta'
$aperte = @(Get-Process -Name Vignetta -ErrorAction SilentlyContinue)
$eraAperta = $aperte.Count -gt 0
if (-not $eraAperta) {
  Write-Host 'Vignetta non è aperta.'
} elseif ($Prova) {
  Write-Host "(prova) chiuderei Vignetta ($($aperte.Count) processi) e la riaprirei alla fine."
} else {
  foreach ($processo in $aperte) { if ($processo.MainWindowHandle -ne 0) { [void]$processo.CloseMainWindow() } }
  $scadenza = (Get-Date).AddSeconds(20)
  while ((Get-Process -Name Vignetta -ErrorAction SilentlyContinue) -and (Get-Date) -lt $scadenza) { Start-Sleep -Milliseconds 500 }
  if (Get-Process -Name Vignetta -ErrorAction SilentlyContinue) { Ferma 'Vignetta non si è chiusa (c''è una finestra di dialogo aperta?). Chiudila a mano e riprova.' }
  Write-Host 'Vignetta chiusa, libreria salvata.'
}

Passo 'Creazione dell''installer'
$installer = Join-Path $progetto "dist\Vignetta-Setup-$versione.exe"
if ($Prova) { Write-Host "(prova) npm run installer -> $installer" } else {
  Esegui-Npm 'installer'
  if (-not (Test-Path $installer)) { Ferma "installer non trovato: $installer" }
}

# /S = silenzioso, /currentuser = solo per questo utente, /D = stessa cartella di prima (deve essere l'ultimo, senza virgolette).
Passo 'Installazione'
$argomenti = "/S /currentuser /D=$($installata.Cartella)"
if ($Prova) { Write-Host "(prova) `"$installer`" $argomenti" } else {
  $setup = Start-Process -FilePath $installer -ArgumentList $argomenti -Wait -PassThru
  if ($setup.ExitCode -ne 0) { Ferma "l'installer è terminato con codice $($setup.ExitCode)." }
  $exe = Join-Path $installata.Cartella 'Vignetta.exe'
  if (-not (Test-Path $exe)) { Ferma "dopo l'installazione manca $exe" }
  $script:versioneSalvata = $null # installata: la nuova versione resta
  Write-Host "Installata la versione ${versione}: $exe"
}

# Gli installer delle versioni precedenti pesano ~100 MB l'uno: resta solo l'ultimo.
Passo 'Pulizia degli installer vecchi'
$vecchi = @(Get-ChildItem (Join-Path $progetto 'dist') -Filter 'Vignetta-Setup-*' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "Vignetta-Setup-$versione.*" })
if ($vecchi.Count -eq 0) { Write-Host 'Nessuno.' }
foreach ($file in $vecchi) {
  if ($Prova) { Write-Host "(prova) eliminerei $($file.Name)" } else { Remove-Item -LiteralPath $file.FullName; Write-Host "Eliminato $($file.Name)" }
}

if ($eraAperta) {
  Passo 'Riapertura di Vignetta'
  if ($Prova) { Write-Host '(prova) riaprirei Vignetta.' } else { Start-Process -FilePath (Join-Path $installata.Cartella 'Vignetta.exe') }
}

Write-Host "`nAggiornamento completato." -ForegroundColor Green
