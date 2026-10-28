//! Touch ID for the optional app lock (frontend/src/components/native/BiometricLock.tsx),
//! through the LocalAuthentication framework. The Mac's password is accepted as a fallback,
//! like Face ID's passcode fallback on iPhone.

use serde::Serialize;

#[derive(Serialize)]
pub struct Status {
    available: bool,
    kind: Option<&'static str>,
}

#[tauri::command]
pub fn biometric_status() -> Status {
    imp::status()
}

#[tauri::command]
pub async fn biometric_verify(reason: String) -> bool {
    // LocalAuthentication answers on its own queue; wait for it off the async runtime.
    tauri::async_runtime::spawn_blocking(move || imp::verify(&reason)).await.unwrap_or(false)
}

#[cfg(target_os = "macos")]
mod imp {
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LABiometryType, LAContext, LAPolicy};

    pub fn status() -> super::Status {
        unsafe {
            let ctx = LAContext::new();
            let available = ctx.canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics).is_ok();
            let kind = match ctx.biometryType() {
                _ if !available => None,
                LABiometryType::TouchID => Some("touch"),
                LABiometryType::FaceID => Some("face"),
                _ => Some("other"),
            };
            super::Status { available, kind }
        }
    }

    pub fn verify(reason: &str) -> bool {
        let (tx, rx) = mpsc::channel();
        let reply = RcBlock::new(move |success: Bool, _error: *mut NSError| {
            let _ = tx.send(success.as_bool());
        });
        unsafe {
            let ctx = LAContext::new();
            ctx.evaluatePolicy_localizedReason_reply(LAPolicy::DeviceOwnerAuthentication, &NSString::from_str(reason), &reply);
        }
        rx.recv().unwrap_or(false)
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn status() -> super::Status {
        super::Status { available: false, kind: None }
    }

    pub fn verify(_reason: &str) -> bool {
        false
    }
}
