; Form FillBridge — Inno Setup 6 installer script
; Compiled by build.ps1 which passes /DExtensionId=<id>

#define AppName      "Form FillBridge"
#define AppVersion   "1.0.0"
#define AppPublisher "Form FillBridge"
#define CrxFile      "FormFillBridge.crx"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppCopyright=Copyright (C) 2024 {#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputBaseFilename=FormFillBridge-Setup
OutputDir=Output
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#CrxFile}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppName} Installer

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#CrxFile}"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
; Tell Chrome to auto-install the extension from the local CRX file
Root: HKLM; Subkey: "SOFTWARE\Google\Chrome\Extensions\{#ExtensionId}"; \
    ValueType: string; ValueName: "path"; \
    ValueData: "{app}\{#CrxFile}"; \
    Flags: createvalueifdoesntexist uninsdeletekey

Root: HKLM; Subkey: "SOFTWARE\Google\Chrome\Extensions\{#ExtensionId}"; \
    ValueType: string; ValueName: "version"; \
    ValueData: "{#AppVersion}"; \
    Flags: createvalueifdoesntexist

; 64-bit Chrome registry path (same values)
Root: HKLM; Subkey: "SOFTWARE\WOW6432Node\Google\Chrome\Extensions\{#ExtensionId}"; \
    ValueType: string; ValueName: "path"; \
    ValueData: "{app}\{#CrxFile}"; \
    Flags: createvalueifdoesntexist uninsdeletekey

Root: HKLM; Subkey: "SOFTWARE\WOW6432Node\Google\Chrome\Extensions\{#ExtensionId}"; \
    ValueType: string; ValueName: "version"; \
    ValueData: "{#AppVersion}"; \
    Flags: createvalueifdoesntexist

[CustomMessages]
FinishedLabel=Form FillBridge has been installed.%n%nRestart Google Chrome — the extension will activate automatically.%n%nChrome may show a one-time confirmation dialog; click "Keep it" to enable the extension.

[Code]
function InitializeSetup(): Boolean;
var
  ChromePath: String;
begin
  ChromePath := ExpandConstant('{pf}\Google\Chrome\Application\chrome.exe');
  if not FileExists(ChromePath) then
    ChromePath := ExpandConstant('{pf32}\Google\Chrome\Application\chrome.exe');
  if not FileExists(ChromePath) then begin
    MsgBox('Google Chrome was not found on this computer.' + #13#10 +
           'Please install Chrome before installing Form FillBridge.',
           mbError, MB_OK);
    Result := False;
    Exit;
  end;
  Result := True;
end;
