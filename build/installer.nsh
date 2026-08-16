; electron-builder's built-in createDesktopShortcut/createStartMenuShortcut
; stopped producing shortcuts on his machine after many same-day reinstalls
; over the same appId (verified: package.json had both set to true, and
; neither a Desktop nor a Start Menu shortcut existed after a real install).
; Force-create them explicitly instead of trusting the default template.

!macro customInstall
  CreateShortCut "$DESKTOP\Lyricist.lnk" "$INSTDIR\Lyricist.exe" "" "$INSTDIR\Lyricist.exe" 0
  CreateDirectory "$SMPROGRAMS\Lyricist"
  CreateShortCut "$SMPROGRAMS\Lyricist\Lyricist.lnk" "$INSTDIR\Lyricist.exe" "" "$INSTDIR\Lyricist.exe" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Lyricist.lnk"
  Delete "$SMPROGRAMS\Lyricist\Lyricist.lnk"
  RMDir "$SMPROGRAMS\Lyricist"
!macroend
