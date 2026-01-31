!include "LogicLib.nsh"
!include "EnvVarUpdate.nsh"

!macro customInstall
  FileOpen $0 "$INSTDIR\ifact.cmd" "w"
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "$\"$INSTDIR\\cli\\ifact.exe$\" %*$\r$\n"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ${EnvVarUpdate} $0 "PATH" "A" "HKCU" "$INSTDIR\cli"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUnInstall
  Delete "$INSTDIR\ifact.cmd"
  ${EnvVarUpdate} $0 "PATH" "R" "HKCU" "$INSTDIR\cli"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
