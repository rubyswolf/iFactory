!include "EnvVarUpdate.nsh"

!macro customInstall
  !insertmacro "_EnvVarUpdateConstructor" $0 "PATH" "A" "HKCU" "$INSTDIR\cli"
!macroend

!macro customUnInstall
  !insertmacro "_unEnvVarUpdateConstructor" $0 "PATH" "R" "HKCU" "$INSTDIR\cli"
!macroend