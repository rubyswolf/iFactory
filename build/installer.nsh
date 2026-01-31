!include "EnvVarUpdate.nsh"

!macro customInstall
  # Add the cli directory to the USER Path
  # "A" = Append, "HKCU" = Current User
  ${EnvVarUpdate} $0 "PATH" "A" "HKCU" "$INSTDIR\cli"
!macroend

!macro customUnInstall
  # Remove the cli directory from the USER Path
  # "R" = Remove, "HKCU" = Current User
  ${un.EnvVarUpdate} $0 "PATH" "R" "HKCU" "$INSTDIR\cli"
!macroend