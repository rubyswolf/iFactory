!include "LogicLib.nsh"
!include "StrFunc.nsh"

${StrStr}
${StrRep}

!macro customInstall
  FileOpen $0 "$INSTDIR\ifact.cmd" "w"
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "\"$INSTDIR\cli\ifact.exe\" %*$\r$\n"
  FileClose $0

  ReadRegStr $1 HKCU "Environment" "Path"
  StrCpy $2 "$INSTDIR\cli"
  ${StrStr} $3 $1 $2
  ${If} $3 == ""
    ${If} $1 == ""
      StrCpy $4 "$2"
    ${Else}
      StrCpy $4 "$1;$2"
    ${EndIf}
    WriteRegExpandStr HKCU "Environment" "Path" $4
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$INSTDIR\ifact.cmd"
  ReadRegStr $1 HKCU "Environment" "Path"
  StrCpy $2 "$INSTDIR"
  ${StrRep} $1 $1 "$2;" ""
  ${StrRep} $1 $1 ";$2" ""
  ${StrRep} $1 $1 "$2" ""
  WriteRegExpandStr HKCU "Environment" "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
