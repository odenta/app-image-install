# app-img-installer

Language of AppImage integration and of the tool's own distribution. The tool integrates AppImages into the Linux desktop; these are the terms for that domain and for how the tool itself ships.

## Language

**AppImage**:
A self-contained Linux application package file that the tool integrates into the desktop.
_Avoid_: App image, appimage package

**Integration**:
Registering an AppImage into the desktop environment: the app file in the apps dir, a desktop entry, and icons, all keyed by the same appId.
_Avoid_: Install into desktop, desktop registration

**Release AppImage**:
The AppImage artifact of the tool itself, published with each release and installed through self-install.
_Avoid_: Bootstrap AppImage, installer AppImage

**Self-install**:
Installing the tool's own Release AppImage by running the tool's own install command on it, triggered from a download one-liner.
_Avoid_: Bootstrap install, self-bootstrap

**Portable run**:
Executing an AppImage (including the tool's own) directly from where it was downloaded, without integrating it into the desktop.
_Avoid_: Standalone mode, uninstalled run

**System webview requirement**:
The GUI's reliance on the operating system's WebKitGTK 4.1 (at or above a minimum version), rather than a bundled copy.
_Avoid_: External webview, shared webkit
