!include "LogicLib.nsh"

!macro customInstall
  FileOpen $0 "$INSTDIR\ifact.cmd" "w"
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "$\"$INSTDIR\\cli\\ifact.exe$\" %*$\r$\n"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$p=[Environment]::GetEnvironmentVariable($\'Path$\',$\'User$\'); $$add=$\'$INSTDIR\\cli$\' ; if ([string]::IsNullOrWhiteSpace($$p)) { $$p=$$add } elseif ($$p -notmatch [regex]::Escape($$add)) { $$p=$$p + $\' ; $\' + $$add }; [Environment]::SetEnvironmentVariable($\'Path$\', $$p, $\'User$\')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUnInstall
  Delete "$INSTDIR\ifact.cmd"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$p=[Environment]::GetEnvironmentVariable($\'Path$\',$\'User$\') -split $\' ; $\'; $$p=$$p | Where-Object { $$_ -and $$_ -ne $\'$INSTDIR\\cli$\' }; [Environment]::SetEnvironmentVariable($\'Path$\', ($$p -join $\' ; $\'), $\'User$\')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
