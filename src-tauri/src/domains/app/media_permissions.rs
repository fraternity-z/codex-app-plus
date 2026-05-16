#[cfg(target_os = "windows")]
pub fn allow_microphone_capture(window: &tauri::WebviewWindow) {
    let result = window.with_webview(|webview| unsafe {
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;
        use webview2_com::{
            Microsoft::Web::WebView2::Win32::*,
            PermissionRequestedEventHandler,
            SetPermissionStateCompletedHandler,
        };
        use windows::core::{Interface, PCWSTR};

        let Ok(webview) = webview.controller().CoreWebView2() else {
            eprintln!("failed to read WebView2 core handle while configuring media permissions");
            return;
        };

        allow_known_microphone_origins(&webview);

        let mut token = 0;
        if let Err(error) = webview.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else {
                    return Ok(());
                };

                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    if let Ok(args3) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
                        let _ = args3.SetSavesInProfile(false);
                    }
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }

                Ok(())
            })),
            &mut token,
        ) {
            eprintln!("failed to configure WebView2 microphone permission handler: {error}");
        }

        unsafe fn allow_known_microphone_origins(webview: &ICoreWebView2) {
            let Ok(webview13) = webview.cast::<ICoreWebView2_13>() else {
                return;
            };
            let Ok(profile) = webview13.Profile() else {
                return;
            };
            let Ok(profile4) = profile.cast::<ICoreWebView2Profile4>() else {
                return;
            };

            for origin in [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://tauri.localhost",
                "https://tauri.localhost",
            ] {
                let wide_origin = to_wide(origin);
                let handler = SetPermissionStateCompletedHandler::create(Box::new(move |result| {
                    if let Err(error) = result {
                        eprintln!("failed to persist WebView2 microphone permission for {origin}: {error}");
                    }
                    Ok(())
                }));
                if let Err(error) = profile4.SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    PCWSTR(wide_origin.as_ptr()),
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    &handler,
                ) {
                    eprintln!("failed to request WebView2 microphone permission persistence for {origin}: {error}");
                }
            }
        }

        fn to_wide(value: &str) -> Vec<u16> {
            OsStr::new(value).encode_wide().chain(std::iter::once(0)).collect()
        }
    });

    if let Err(error) = result {
        eprintln!("failed to access WebView2 while configuring media permissions: {error}");
    }
}

#[cfg(not(target_os = "windows"))]
pub fn allow_microphone_capture(_window: &tauri::WebviewWindow) {}
