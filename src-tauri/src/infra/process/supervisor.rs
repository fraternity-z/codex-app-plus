use portable_pty::Child as PtyChild;
use tokio::process::Child as TokioChild;

use crate::error::AppResult;

pub struct ProcessSupervisor {
    inner: PlatformProcessSupervisor,
}

impl ProcessSupervisor {
    pub fn new(label: &'static str) -> AppResult<Self> {
        Ok(Self {
            inner: PlatformProcessSupervisor::new(label)?,
        })
    }

    pub fn assign_tokio_child(&self, child: &TokioChild) -> AppResult<()> {
        self.inner.assign_tokio_child(child)
    }

    pub fn assign_portable_child(&self, child: &dyn PtyChild) -> AppResult<()> {
        self.inner.assign_portable_child(child)
    }

    pub fn terminate(&self) -> AppResult<()> {
        self.inner.terminate()
    }
}

#[cfg(not(windows))]
struct PlatformProcessSupervisor;

#[cfg(not(windows))]
impl PlatformProcessSupervisor {
    fn new(_label: &'static str) -> AppResult<Self> {
        Ok(Self)
    }

    fn assign_tokio_child(&self, _child: &TokioChild) -> AppResult<()> {
        Ok(())
    }

    fn assign_portable_child(&self, _child: &dyn PtyChild) -> AppResult<()> {
        Ok(())
    }

    fn terminate(&self) -> AppResult<()> {
        Ok(())
    }
}

#[cfg(windows)]
use windows_impl::PlatformProcessSupervisor;

#[cfg(windows)]
mod windows_impl {
    use std::mem::{size_of, zeroed};
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle};
    use std::ptr::null;

    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    use super::{AppResult, PtyChild, TokioChild};
    use crate::error::AppError;

    pub struct PlatformProcessSupervisor {
        job: OwnedHandle,
        label: &'static str,
    }

    impl PlatformProcessSupervisor {
        pub fn new(label: &'static str) -> AppResult<Self> {
            let raw_job = unsafe { CreateJobObjectW(null(), null()) };
            if raw_job.is_null() {
                return Err(job_error(label, "create Windows job object"));
            }
            let job = unsafe { OwnedHandle::from_raw_handle(raw_job as RawHandle) };
            configure_job(&job, label)?;
            Ok(Self { job, label })
        }

        pub fn assign_tokio_child(&self, child: &TokioChild) -> AppResult<()> {
            let process = child.raw_handle().ok_or_else(|| {
                AppError::Protocol(format!(
                    "failed to obtain raw handle for {} child process",
                    self.label
                ))
            })?;
            self.assign_raw_handle(process as HANDLE, "tokio child")
        }

        pub fn assign_portable_child(&self, child: &dyn PtyChild) -> AppResult<()> {
            let process = child.as_raw_handle().ok_or_else(|| {
                AppError::Protocol(format!(
                    "failed to obtain raw handle for {} terminal process",
                    self.label
                ))
            })?;
            self.assign_raw_handle(process as HANDLE, "terminal child")
        }

        pub fn terminate(&self) -> AppResult<()> {
            let result = unsafe { TerminateJobObject(self.job_handle(), 1) };
            if result == 0 {
                return Err(job_error(self.label, "terminate Windows job object"));
            }
            Ok(())
        }

        #[cfg(test)]
        pub fn assign_test_handle(&self, process: HANDLE) -> AppResult<()> {
            self.assign_raw_handle(process, "test child")
        }

        fn assign_raw_handle(&self, process: HANDLE, process_kind: &str) -> AppResult<()> {
            let result = unsafe { AssignProcessToJobObject(self.job_handle(), process) };
            if result == 0 {
                return Err(job_error(
                    self.label,
                    &format!("assign {process_kind} to Windows job object"),
                ));
            }
            Ok(())
        }

        fn job_handle(&self) -> HANDLE {
            self.job.as_raw_handle() as HANDLE
        }
    }

    fn configure_job(job: &OwnedHandle, label: &str) -> AppResult<()> {
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let result = unsafe {
            SetInformationJobObject(
                job.as_raw_handle() as HANDLE,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if result == 0 {
            return Err(job_error(label, "configure Windows job object"));
        }
        Ok(())
    }

    fn job_error(label: &str, action: &str) -> AppError {
        let error = std::io::Error::last_os_error();
        AppError::Io(format!("failed to {action} for {label}: {error}"))
    }

    #[cfg(test)]
    mod tests {
        use std::fs;
        use std::path::PathBuf;
        use std::time::Duration;

        use crate::test_support::unique_temp_file;
        use tokio::process::Command;
        use tokio::time::{sleep, timeout};
        use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, WaitForSingleObject, CREATE_NO_WINDOW, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_SYNCHRONIZE,
        };

        use super::PlatformProcessSupervisor;

        #[tokio::test]
        async fn terminates_spawned_process_tree() {
            let supervisor = PlatformProcessSupervisor::new("test-tree").unwrap();
            let pid_path = unique_path("descendant");
            let mut child = spawn_process_tree(&pid_path).await;
            supervisor.assign_tokio_child(&child).unwrap();

            let descendant_pid = wait_for_pid_file(&pid_path).await;
            assert!(process_exists(descendant_pid));

            supervisor.terminate().unwrap();
            timeout(Duration::from_secs(10), child.wait())
                .await
                .unwrap()
                .unwrap();
            wait_for_exit(descendant_pid).await;
            assert!(!process_exists(descendant_pid));
        }

        #[test]
        fn rejects_invalid_process_handle() {
            let supervisor = PlatformProcessSupervisor::new("test-invalid").unwrap();
            let error = supervisor
                .assign_test_handle(std::ptr::null_mut())
                .unwrap_err();
            assert!(error.to_string().contains("assign test child"));
        }

        async fn spawn_process_tree(pid_path: &PathBuf) -> tokio::process::Child {
            let script = format!(
                "$PID | Set-Content -Path '{}'; Start-Sleep -Seconds 30",
                pid_path.display().to_string().replace('\\', "\\\\")
            );
            let mut command = Command::new("cmd.exe");
            command.creation_flags(CREATE_NO_WINDOW).args([
                "/C",
                "powershell.exe",
                "-NoProfile",
                "-Command",
                &script,
            ]);
            command.spawn().unwrap()
        }

        async fn wait_for_pid_file(path: &PathBuf) -> u32 {
            for _ in 0..100 {
                if let Ok(value) = fs::read_to_string(path) {
                    return value.trim().parse().unwrap();
                }
                sleep(Duration::from_millis(100)).await;
            }
            panic!("timed out waiting for descendant pid file")
        }

        async fn wait_for_exit(pid: u32) {
            for _ in 0..100 {
                if !process_exists(pid) {
                    return;
                }
                sleep(Duration::from_millis(100)).await;
            }
            panic!("timed out waiting for pid {pid} to exit")
        }

        fn process_exists(pid: u32) -> bool {
            let handle = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                    0,
                    pid,
                )
            };
            if handle.is_null() {
                return false;
            }
            let state = unsafe { WaitForSingleObject(handle, 0) };
            unsafe {
                CloseHandle(handle);
            }
            state != WAIT_OBJECT_0
        }

        fn unique_path(name: &str) -> PathBuf {
            unique_temp_file("codex-app-plus", name, "txt")
        }
    }
}
