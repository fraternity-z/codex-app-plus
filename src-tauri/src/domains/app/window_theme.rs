use crate::error::{AppError, AppResult};

#[derive(Clone, Copy)]
pub enum WindowTheme {
    Light,
    Dark,
}

impl WindowTheme {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "light" => Ok(Self::Light),
            "dark" => Ok(Self::Dark),
            _ => Err(AppError::InvalidInput(format!("未知窗口主题: {value}"))),
        }
    }
}

#[cfg(windows)]
mod platform {
    use super::WindowTheme;
    use crate::error::{AppError, AppResult};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::sync_channel;
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;
    use windows_sys::Win32::Graphics::Gdi::{
        RedrawWindow, RDW_ALLCHILDREN, RDW_FRAME, RDW_INVALIDATE, RDW_UPDATENOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    };

    const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_CAPTION_COLOR: u32 = 35;
    const DWMWA_TEXT_COLOR: u32 = 36;
    const E_INVALIDARG: i32 = -2147024809;

    const LIGHT_CAPTION_COLOR: u32 = rgb(245, 247, 251);
    const LIGHT_BORDER_COLOR: u32 = rgb(226, 232, 240);
    const LIGHT_TEXT_COLOR: u32 = rgb(15, 23, 42);
    const DARK_CAPTION_COLOR: u32 = rgb(31, 31, 31);
    const DARK_BORDER_COLOR: u32 = rgb(47, 47, 47);
    const DARK_TEXT_COLOR: u32 = rgb(243, 243, 243);

    static CAPTION_COLOR_SUPPORTED: AtomicBool = AtomicBool::new(true);
    static BORDER_COLOR_SUPPORTED: AtomicBool = AtomicBool::new(true);
    static TEXT_COLOR_SUPPORTED: AtomicBool = AtomicBool::new(true);

    #[derive(Clone, Copy)]
    enum OptionalDwmAttribute {
        CaptionColor,
        BorderColor,
        TextColor,
    }

    impl OptionalDwmAttribute {
        const fn id(self) -> u32 {
            match self {
                Self::CaptionColor => DWMWA_CAPTION_COLOR,
                Self::BorderColor => DWMWA_BORDER_COLOR,
                Self::TextColor => DWMWA_TEXT_COLOR,
            }
        }

        const fn label(self) -> &'static str {
            match self {
                Self::CaptionColor => "标题栏颜色",
                Self::BorderColor => "窗口边框颜色",
                Self::TextColor => "标题栏文本颜色",
            }
        }
    }

    pub fn apply_window_theme(window: &WebviewWindow, theme: WindowTheme) -> AppResult<()> {
        let (sender, receiver) = sync_channel(1);
        let dispatch_window = window.clone();
        let themed_window = dispatch_window.clone();
        dispatch_window
            .run_on_main_thread(move || {
                let result = apply_window_theme_now(&themed_window, theme);
                let _ = sender.send(result);
            })
            .map_err(|error| AppError::Protocol(format!("窗口主题主线程调度失败: {error}")))?;

        receiver
            .recv()
            .map_err(|_| AppError::Protocol("窗口主题主线程结果接收失败".to_string()))?
    }

    fn apply_window_theme_now(window: &WebviewWindow, theme: WindowTheme) -> AppResult<()> {
        let hwnd = window
            .hwnd()
            .map_err(|error| AppError::Protocol(format!("获取窗口句柄失败: {error}")))?;
        let raw_hwnd = hwnd.0 as HWND;
        let dark_mode_enabled: i32 = matches!(theme, WindowTheme::Dark).into();
        let (caption_color, border_color, text_color) = match theme {
            WindowTheme::Light => (LIGHT_CAPTION_COLOR, LIGHT_BORDER_COLOR, LIGHT_TEXT_COLOR),
            WindowTheme::Dark => (DARK_CAPTION_COLOR, DARK_BORDER_COLOR, DARK_TEXT_COLOR),
        };

        set_required_dwm_attribute(
            raw_hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark_mode_enabled,
            "沉浸式深色模式",
        )?;
        set_optional_dwm_attribute(raw_hwnd, OptionalDwmAttribute::CaptionColor, &caption_color)?;
        set_optional_dwm_attribute(raw_hwnd, OptionalDwmAttribute::BorderColor, &border_color)?;
        set_optional_dwm_attribute(raw_hwnd, OptionalDwmAttribute::TextColor, &text_color)?;
        force_title_bar_redraw(raw_hwnd);

        Ok(())
    }

    fn apply_dwm_attribute<T>(hwnd: HWND, attribute: u32, value: &T) -> Result<(), i32> {
        let status = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                attribute,
                value as *const T as *const core::ffi::c_void,
                core::mem::size_of::<T>() as u32,
            )
        };
        if status == 0 {
            return Ok(());
        }
        Err(status)
    }

    fn set_required_dwm_attribute<T>(
        hwnd: HWND,
        attribute: u32,
        value: &T,
        label: &str,
    ) -> AppResult<()> {
        let status = apply_dwm_attribute(hwnd, attribute, value);
        if status.is_ok() {
            return Ok(());
        }
        let status = status.unwrap_err();
        Err(AppError::Protocol(format!(
            "设置{label}失败，DWM 错误码: {status}"
        )))
    }

    fn set_optional_dwm_attribute<T>(
        hwnd: HWND,
        attribute: OptionalDwmAttribute,
        value: &T,
    ) -> AppResult<()> {
        if !supports_optional_dwm_attribute(attribute) {
            return Ok(());
        }

        match apply_dwm_attribute(hwnd, attribute.id(), value) {
            Ok(()) => Ok(()),
            Err(status) if status == E_INVALIDARG => {
                let _ = mark_optional_dwm_attribute_unsupported(attribute);
                Ok(())
            }
            Err(status) => Err(AppError::Protocol(format!(
                "设置{}失败，DWM 错误码: {status}",
                attribute.label()
            ))),
        }
    }

    fn supports_optional_dwm_attribute(attribute: OptionalDwmAttribute) -> bool {
        optional_dwm_support_flag(attribute).load(Ordering::Relaxed)
    }

    fn mark_optional_dwm_attribute_unsupported(attribute: OptionalDwmAttribute) -> bool {
        optional_dwm_support_flag(attribute).swap(false, Ordering::Relaxed)
    }

    fn optional_dwm_support_flag(attribute: OptionalDwmAttribute) -> &'static AtomicBool {
        match attribute {
            OptionalDwmAttribute::CaptionColor => &CAPTION_COLOR_SUPPORTED,
            OptionalDwmAttribute::BorderColor => &BORDER_COLOR_SUPPORTED,
            OptionalDwmAttribute::TextColor => &TEXT_COLOR_SUPPORTED,
        }
    }

    fn force_title_bar_redraw(hwnd: HWND) {
        unsafe {
            let _ = SetWindowPos(
                hwnd,
                core::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
            );
            let _ = RedrawWindow(
                hwnd,
                core::ptr::null(),
                core::ptr::null_mut(),
                RDW_ALLCHILDREN | RDW_FRAME | RDW_INVALIDATE | RDW_UPDATENOW,
            );
        }
    }

    const fn rgb(red: u32, green: u32, blue: u32) -> u32 {
        red | (green << 8) | (blue << 16)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn optional_attributes_stop_retrying_after_marked_unsupported() {
            reset_optional_dwm_support();

            assert!(supports_optional_dwm_attribute(
                OptionalDwmAttribute::CaptionColor
            ));
            assert!(mark_optional_dwm_attribute_unsupported(
                OptionalDwmAttribute::CaptionColor
            ));
            assert!(!mark_optional_dwm_attribute_unsupported(
                OptionalDwmAttribute::CaptionColor
            ));
            assert!(!supports_optional_dwm_attribute(
                OptionalDwmAttribute::CaptionColor
            ));

            reset_optional_dwm_support();
        }

        #[test]
        fn optional_attributes_track_support_independently() {
            reset_optional_dwm_support();

            assert!(supports_optional_dwm_attribute(
                OptionalDwmAttribute::BorderColor
            ));
            assert!(supports_optional_dwm_attribute(
                OptionalDwmAttribute::TextColor
            ));
            let _ = mark_optional_dwm_attribute_unsupported(OptionalDwmAttribute::BorderColor);
            assert!(!supports_optional_dwm_attribute(
                OptionalDwmAttribute::BorderColor
            ));
            assert!(supports_optional_dwm_attribute(
                OptionalDwmAttribute::TextColor
            ));

            reset_optional_dwm_support();
        }

        fn reset_optional_dwm_support() {
            CAPTION_COLOR_SUPPORTED.store(true, Ordering::Relaxed);
            BORDER_COLOR_SUPPORTED.store(true, Ordering::Relaxed);
            TEXT_COLOR_SUPPORTED.store(true, Ordering::Relaxed);
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::WindowTheme;
    use crate::error::{AppError, AppResult};
    use tauri::WebviewWindow;

    pub fn apply_window_theme(_window: &WebviewWindow, _theme: WindowTheme) -> AppResult<()> {
        Err(AppError::Protocol("窗口主题同步仅支持 Windows".to_string()))
    }
}

pub use platform::apply_window_theme;
