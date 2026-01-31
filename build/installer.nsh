!include "LogicLib.nsh"
!include "StrFunc.nsh"
!include "WordFunc.nsh"

!macro customInstall
  FileOpen $0 "$INSTDIR\ifact.cmd" "w"
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "\"$INSTDIR\cli\ifact.exe\" %*$\r$\n"
  FileClose $0

  ReadRegStr $1 HKCU "Environment" "Path"
  StrCpy $2 "$INSTDIR\cli"
  ${If} $1 == ""
    StrCpy $4 "$2"
  ${Else}
    StrCpy $4 "$1;$2"
  ${EndIf}
  StrCpy $5 "$4"
  ${StrStr} $6 $5 ";;"
  ${DoWhile} $6 != ""
    ${StrRep} $5 $5 ";;" ";"
    ${StrStr} $6 $5 ";;"
  ${Loop}
  Push $5
  Call PathUnique
  Pop $5
  WriteRegExpandStr HKCU "Environment" "Path" $5
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUnInstall
  Delete "$INSTDIR\ifact.cmd"
  ReadRegStr $1 HKCU "Environment" "Path"
  StrCpy $2 "$INSTDIR\cli"
  ${StrRep} $1 $1 "$2;" ""
  ${StrRep} $1 $1 ";$2" ""
  ${StrRep} $1 $1 "$2" ""
  ${StrStr} $3 $1 ";;"
  ${DoWhile} $3 != ""
    ${StrRep} $1 $1 ";;" ";"
    ${StrStr} $3 $1 ";;"
  ${Loop}
  WriteRegExpandStr HKCU "Environment" "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
