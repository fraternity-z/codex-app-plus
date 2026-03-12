use std::process::Command as StdCommand;

use tokio::process::Command as TokioCommand;

#[cfg(not(windows))]
const NO_CREATION_FLAGS: u32 = 0;

#[cfg(windows)]
const BACKGROUND_CREATION_FLAGS: u32 = windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

#[cfg(not(windows))]
const BACKGROUND_CREATION_FLAGS: u32 = NO_CREATION_FLAGS;

pub(crate) fn configure_background_std_command(command: &mut StdCommand) {
    configure_std_creation_flags(command);
}

pub(crate) fn configure_background_tokio_command(command: &mut TokioCommand) {
    configure_background_std_command(command.as_std_mut());
}

const fn background_creation_flags() -> u32 {
    BACKGROUND_CREATION_FLAGS
}

#[cfg(windows)]
fn configure_std_creation_flags(command: &mut StdCommand) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(background_creation_flags());
}

#[cfg(not(windows))]
fn configure_std_creation_flags(_command: &mut StdCommand) {}

#[cfg(test)]
mod tests {
    use std::process::Command as StdCommand;

    use tokio::process::Command as TokioCommand;

    use super::{
        background_creation_flags, configure_background_std_command,
        configure_background_tokio_command,
    };

    #[test]
    fn configures_background_std_command() {
        let mut command = StdCommand::new("git");
        configure_background_std_command(&mut command);
    }

    #[test]
    fn configures_background_tokio_command() {
        let mut command = TokioCommand::new("git");
        configure_background_tokio_command(&mut command);
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
}
