//! The ABI every wasm module of the website speaks, without wasm-bindgen: a module exports
//! functions that take one UTF-8 string and answer one, which `website/src/lib/wasm/module.ts`
//! calls.
//!
//! 1. `alloc(len)` reserves `len` bytes for the input; the caller writes the string there.
//! 2. An exported function `(ptr, len) -> u32` reads and frees it, and answers 1 on success, 0 on
//!    failure.
//! 3. `output_ptr()` / `output_len()` locate the answer: the result on success, the error message
//!    on failure. It stays valid until the next call.
//!
//! A module declares its functions with [`export!`].
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

use core::cell::RefCell;

thread_local! {
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Exports the ABI's `alloc`, `output_ptr` and `output_len`, and one function per `name =>
/// handler`.
///
/// A handler is a `fn(&str) -> Result<String, String>`. Call it once per module, inside a module
/// of its own so the exported names do not clash with the crate's:
///
/// ```ignore
/// #[cfg(target_arch = "wasm32")]
/// mod ffi {
///     wasm_abi::export!(decode => crate::decode_json, encode => crate::encode_json);
/// }
/// ```
#[macro_export]
macro_rules! export {
    ($($name:ident => $handler:path),* $(,)?) => {
        #[unsafe(no_mangle)]
        pub extern "C" fn alloc(len: usize) -> *mut u8 {
            $crate::alloc(len)
        }

        #[unsafe(no_mangle)]
        pub extern "C" fn output_ptr() -> *const u8 {
            $crate::output_ptr()
        }

        #[unsafe(no_mangle)]
        pub extern "C" fn output_len() -> usize {
            $crate::output_len()
        }

        $(
            /// # Safety `ptr` and `len` must come from one `alloc` call, with `len` bytes written.
            #[unsafe(no_mangle)]
            pub unsafe extern "C" fn $name(ptr: *mut u8, len: usize) -> u32 {
                // SAFETY: as the caller promises.
                let input = unsafe { $crate::take_input(ptr, len) };
                $crate::answer($handler(&input))
            }
        )*
    };
}

#[doc(hidden)]
#[must_use]
pub fn alloc(len: usize) -> *mut u8 {
    Box::into_raw(Box::<[u8]>::new_uninit_slice(len)).cast::<u8>()
}

/// Takes back the buffer [`alloc`] handed out, with the `len` bytes the caller wrote into it.
///
/// # Safety `ptr` must come from `alloc(len)`, with `len` bytes written.
#[doc(hidden)]
pub unsafe fn take_input(ptr: *mut u8, len: usize) -> String {
    // SAFETY: as the caller promises, so this is the boxed slice `alloc` leaked, now initialized.
    let bytes: Box<[u8]> = unsafe { Box::from_raw(core::ptr::slice_from_raw_parts_mut(ptr, len)) };
    String::from_utf8_lossy(&bytes).into_owned()
}

#[doc(hidden)]
#[must_use]
pub fn answer(result: Result<String, String>) -> u32 {
    let (ok, text) = match result {
        Ok(text) => (1, text),
        Err(text) => (0, text),
    };
    OUTPUT.with_borrow_mut(|output| *output = text.into_bytes());
    ok
}

#[doc(hidden)]
pub fn output_ptr() -> *const u8 {
    OUTPUT.with_borrow(Vec::as_ptr)
}

#[doc(hidden)]
pub fn output_len() -> usize {
    OUTPUT.with_borrow(Vec::len)
}
