//! Client-side encryption for sync payloads.
//!
//! Produces a self-contained, versioned token — `version || salt || nonce ||
//! ciphertext`, Base64-encoded — that can be stored directly in the
//! `sync_records.ciphertext` column. The key is derived from a device
//! passphrase with Argon2id, and payloads are sealed with XChaCha20-Poly1305,
//! so plaintext clipboard and library content never has to leave the device.

use crate::error::{AppError, ErrorCode};
use argon2::Argon2;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chacha20poly1305::aead::rand_core::RngCore;
use chacha20poly1305::aead::{Aead, OsRng};
use chacha20poly1305::{AeadCore, Key, KeyInit, XChaCha20Poly1305, XNonce};

const VERSION: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;
const HEADER_LEN: usize = 1 + SALT_LEN + NONCE_LEN;

fn crypto_error(message: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::Internal, message)
}

fn derive_key(passphrase: &[u8], salt: &[u8]) -> Result<[u8; KEY_LEN], AppError> {
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(passphrase, salt, &mut key)
        .map_err(|error| crypto_error(format!("key derivation failed: {error}")))?;
    Ok(key)
}

/// Seals `plaintext` under `passphrase`, returning a Base64 token that is safe
/// to store in the `sync_records.ciphertext` column.
pub fn encrypt(passphrase: &str, plaintext: &[u8]) -> Result<String, AppError> {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(passphrase.as_bytes(), &salt)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| crypto_error("encryption failed"))?;

    let mut token = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    token.push(VERSION);
    token.extend_from_slice(&salt);
    token.extend_from_slice(nonce.as_slice());
    token.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(token))
}

/// Opens a token produced by [`encrypt`], returning the original plaintext.
/// Fails if the passphrase is wrong or the token has been tampered with.
pub fn decrypt(passphrase: &str, token: &str) -> Result<Vec<u8>, AppError> {
    let raw = STANDARD
        .decode(token)
        .map_err(|_| crypto_error("ciphertext is not valid Base64"))?;
    if raw.len() < HEADER_LEN || raw[0] != VERSION {
        return Err(crypto_error("unrecognized ciphertext format"));
    }
    let salt = &raw[1..1 + SALT_LEN];
    let nonce = XNonce::from_slice(&raw[1 + SALT_LEN..HEADER_LEN]);
    let key = derive_key(passphrase.as_bytes(), salt)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    cipher
        .decrypt(nonce, &raw[HEADER_LEN..])
        .map_err(|_| crypto_error("could not decrypt: wrong passphrase or corrupt data"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_recovers_plaintext() {
        let token = encrypt("correct horse", b"clipboard secret").unwrap();
        assert_eq!(decrypt("correct horse", &token).unwrap(), b"clipboard secret");
    }

    #[test]
    fn wrong_passphrase_is_rejected() {
        let token = encrypt("right", b"payload").unwrap();
        assert!(decrypt("wrong", &token).is_err());
    }

    #[test]
    fn tampered_ciphertext_is_rejected() {
        let token = encrypt("key", b"payload").unwrap();
        let mut raw = STANDARD.decode(&token).unwrap();
        let last = raw.len() - 1;
        raw[last] ^= 0x01;
        assert!(decrypt("key", &STANDARD.encode(raw)).is_err());
    }

    #[test]
    fn each_encryption_uses_fresh_salt_and_nonce() {
        let first = encrypt("key", b"payload").unwrap();
        let second = encrypt("key", b"payload").unwrap();
        assert_ne!(first, second);
    }

    #[test]
    fn empty_plaintext_round_trips() {
        let token = encrypt("key", b"").unwrap();
        assert!(decrypt("key", &token).unwrap().is_empty());
    }

    #[test]
    fn malformed_tokens_are_rejected() {
        assert!(decrypt("key", "not base64 @@@").is_err());
        assert!(decrypt("key", &STANDARD.encode([0u8; 3])).is_err());
    }
}
