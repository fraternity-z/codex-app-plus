use std::process::Command as StdCommand;

use tokio::process::Command as TokioCommand;

#[cfg(not(windows))]
const NO_CREATION_FLAGS: u32 = 0;

#[cfg(windows)]
const BACKGROUND_CREATION_FLAGS: u32 = windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

#[cfg(not(windows))]
const BACKGROUND_CREATION_FLAGS: u32 = NO_CREATION_FLAGS;

#[cfg(windows)]
const VISIBLE_CONSOLE_CREATION_FLAGS: u32 =
    windows_sys::Win32::System::Threading::CREATE_NEW_CONSOLE;

pub(crate) fn configure_background_std_command(command: &mut StdCommand) {
    configure_std_creation_flags(command);
}

pub(crate) fn configure_child_tree_root_tokio_command(command: &mut TokioCommand) {
    configure_child_tree_root_std_command(command.as_std_mut());
}

pub(crate) fn configure_child_tree_root_std_command(command: &mut StdCommand) {
    // Intentionally avoid CREATE_NO_WINDOW here. The app allocates a hidden parent
    // console, and this child should inherit it so console grandchildren do not
    // allocate visible cmd.exe windows.
    let _ = command;
}

pub(crate) fn configure_visible_console_std_command(command: &mut StdCommand) {
    configure_visible_console_creation_flags(command);
}

pub(crate) fn ensure_hidden_parent_console() {
    ensure_hidden_parent_console_impl();
}

const fn background_creation_flags() -> u32 {
    BACKGROUND_CREATION_FLAGS
}

#[cfg(windows)]
const fn visible_console_creation_flags() -> u32 {
    VISIBLE_CONSOLE_CREATION_FLAGS
}

#[cfg(windows)]
fn configure_std_creation_flags(command: &mut StdCommand) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(background_creation_flags());
}

#[cfg(not(windows))]
fn configure_std_creation_flags(_command: &mut StdCommand) {}

#[cfg(windows)]
fn configure_visible_console_creation_flags(command: &mut StdCommand) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(visible_console_creation_flags());
}

#[cfg(not(windows))]
fn configure_visible_console_creation_flags(_command: &mut StdCommand) {}

#[cfg(windows)]
fn ensure_hidden_parent_console_impl() {
    use windows_sys::Win32::System::Console::{AllocConsole, GetConsoleWindow};
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};

    unsafe {
        if !GetConsoleWindow().is_null() {
            return;
        }
        if AllocConsole() == 0 {
            return;
        }
        let console_window = GetConsoleWindow();
        if !console_window.is_null() {
            ShowWindow(console_window, SW_HIDE);
        }
    }
}

#[cfg(not(windows))]
fn ensure_hidden_parent_console_impl() {}

#[cfg(test)]
mod tests {
    use std::process::Command as StdCommand;

    use tokio::process::Command as TokioCommand;

    use super::{
        background_creation_flags, configure_background_std_command,
        configure_child_tree_root_std_command, configure_child_tree_root_tokio_command,
        configure_visible_console_std_command, ensure_hidden_parent_console,
    };

    #[test]
    fn configures_background_std_command() {
        let mut command = StdCommand::new("git");
        configure_background_std_command(&mut command);
    }

    #[test]
    fn configures_child_tree_root_std_command() {
        let mut command = StdCommand::new("git");
        configure_child_tree_root_std_command(&mut command);
    }

    #[test]
    fn configures_child_tree_root_tokio_command() {
        let mut command = TokioCommand::new("git");
        configure_child_tree_root_tokio_command(&mut command);
    }

    #[test]
    fn configures_visible_console_std_command() {
        let mut command = StdCommand::new("git");
        configure_visible_console_std_command(&mut command);
    }

    #[test]
    fn ensures_hidden_parent_console() {
        ensure_hidden_parent_console();
    }

    #[test]
    fn exposes_expected_background_creation_flags() {
        #[cfg(windows)]
        {
            assert_eq!(
                background_creation_flags(),
                windows_sys::Win32::System::Threading::CREATE_NO_WINDOW
            );
        }

        #[cfg(not(windows))]
        {
            assert_eq!(background_creation_flags(), super::NO_CREATION_FLAGS);
        }
    }

    #[test]
    fn exposes_expected_visible_console_creation_flags() {
        #[cfg(windows)]
        {
            assert_eq!(
                super::visible_console_creation_flags(),
                windows_sys::Win32::System::Threading::CREATE_NEW_CONSOLE
            );
        }
    }
}
