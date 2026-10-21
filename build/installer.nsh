; Personalizzazioni dell'installer NSIS (incluso automaticamente da electron-builder, dopo le sue associazioni).

!macro vignettaVerb CLASS
  ; Testo in italiano e percorso tra virgolette anche se la cartella d'installazione contiene spazi.
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}\shell\open" "" "Apri con Vignetta"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}\shell\open\command" "" '"$appExe" "%1"'
!macroend

!macro customInstall
  !insertmacro vignettaVerb "Vignetta.cbz"
  !insertmacro vignettaVerb "Vignetta.cbr"

  ; Il PDF compare in «Apri con» senza prendere il posto del lettore PDF già in uso:
  ; si registra solo in OpenWithProgids, senza cambiare il programma predefinito dell'estensione.
  WriteRegStr SHELL_CONTEXT "Software\Classes\Vignetta.pdf" "" "Documento PDF"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Vignetta.pdf\DefaultIcon" "" "$appExe,0"
  !insertmacro vignettaVerb "Vignetta.pdf"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "Vignetta.pdf"

  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)"
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "Vignetta.pdf"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Vignetta.pdf"
!macroend
