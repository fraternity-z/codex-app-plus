fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    prepare_macos_bundles();
    tauri_build::build()
}

#[cfg(unix)]
fn prepare_macos_bundles() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    use std::os::unix::fs::PermissionsExt;

    let manifest_dir = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is required"),
    );
    let executables = [
        "bundled/computer-use-macos/plugins/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService",
        "bundled/computer-use-macos/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/Codex Computer Use Installer.app/Contents/MacOS/Codex Computer Use Installer",
        "bundled/computer-use-macos/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/CUALockScreenGuardian.app/Contents/MacOS/CUALockScreenGuardian",
        "bundled/computer-use-macos/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
    ];

    for executable in executables {
        let executable = manifest_dir.join(executable);
        println!("cargo:rerun-if-changed={}", executable.display());

        let metadata = std::fs::metadata(&executable).unwrap_or_else(|error| {
            panic!(
                "macOS Computer Use executable is missing: {}: {error}",
                executable.display()
            )
        });
        let mut permissions = metadata.permissions();
        let current_mode = permissions.mode();
        let executable_mode = current_mode | 0o755;
        if executable_mode != current_mode {
            permissions.set_mode(executable_mode);
            std::fs::set_permissions(&executable, permissions).unwrap_or_else(|error| {
                panic!(
                    "failed to mark macOS Computer Use executable as executable: {}: {error}",
                    executable.display()
                )
            });
        }
    }
}

#[cfg(not(unix))]
fn prepare_macos_bundles() {}
