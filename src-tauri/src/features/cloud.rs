//! Signed object uploads to S3 and any S3-compatible service, Cloudflare R2
//! included.
//!
//! This runs in Rust rather than the webview for two reasons: the app's CSP
//! allows no outbound origins at all, and the secret access key must never be
//! handed to page JavaScript. Only the two operations a backup needs are
//! implemented -- PUT and DELETE of a single object -- signed with SigV4.
//!
//! HMAC is written out here instead of pulled in as a dependency: the `hmac`
//! crate tracks `digest` 0.10 while this crate is already on `sha2` 0.11, so
//! taking it would mean compiling a second copy of SHA-256. HMAC over a fixed
//! block size is a dozen lines and is covered by the RFC 4231 vectors below.

use crate::{
    error::{AppError, ErrorCode},
    models::{CloudBackupSettings, CloudProvider},
};
use sha2::{Digest, Sha256};
use std::time::Duration;

const SHA256_BLOCK: usize = 64;
const ALGORITHM: &str = "AWS4-HMAC-SHA256";
const SERVICE: &str = "s3";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

fn cloud_error(message: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::Internal, message)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut padded = [0u8; SHA256_BLOCK];
    if key.len() > SHA256_BLOCK {
        padded[..32].copy_from_slice(&sha256(key));
    } else {
        padded[..key.len()].copy_from_slice(key);
    }

    let mut inner = Vec::with_capacity(SHA256_BLOCK + message.len());
    let mut outer = Vec::with_capacity(SHA256_BLOCK + 32);
    for byte in padded {
        inner.push(byte ^ 0x36);
        outer.push(byte ^ 0x5c);
    }
    inner.extend_from_slice(message);
    outer.extend_from_slice(&sha256(&inner));
    sha256(&outer)
}

/// Percent-encodes one path segment per SigV4's rules: unreserved characters
/// pass through, everything else becomes uppercase `%XX`. `/` is a separator
/// and is therefore encoded by the caller's join, not here.
fn encode_segment(segment: &str) -> String {
    let mut encoded = String::with_capacity(segment.len());
    for byte in segment.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn encode_key(key: &str) -> String {
    key.split('/').map(encode_segment).collect::<Vec<_>>().join("/")
}

/// A resolved destination: which host to talk to, which region to sign for, and
/// the request path that addresses the object.
pub struct Bucket {
    host: String,
    region: String,
    /// `true` when the bucket name is part of the path rather than the host.
    /// Custom endpoints -- R2 always, MinIO and friends usually -- only work
    /// this way, while plain AWS is addressed virtual-hosted.
    path_style: bool,
    bucket: String,
    access_key_id: String,
    secret_access_key: String,
}

impl Bucket {
    pub fn from_settings(settings: &CloudBackupSettings) -> Result<Self, AppError> {
        let bucket = settings.bucket.trim();
        if bucket.is_empty() {
            return Err(cloud_error("no bucket is configured"));
        }
        let endpoint = settings.endpoint.trim().trim_end_matches('/');
        let region = match settings.provider {
            // R2 has one region and rejects anything else in the credential
            // scope, so the field is not the user's to get wrong.
            CloudProvider::R2 => "auto".to_string(),
            _ if settings.region.trim().is_empty() => "us-east-1".to_string(),
            _ => settings.region.trim().to_string(),
        };

        let (host, path_style) = if endpoint.is_empty() {
            (format!("{bucket}.s3.{region}.amazonaws.com"), false)
        } else {
            let host = endpoint
                .strip_prefix("https://")
                .ok_or_else(|| cloud_error("endpoint must start with https://"))?;
            if host.is_empty() {
                return Err(cloud_error("endpoint has no host"));
            }
            (host.to_string(), true)
        };

        Ok(Self {
            host,
            region,
            path_style,
            bucket: bucket.to_string(),
            access_key_id: settings.access_key_id.trim().to_string(),
            secret_access_key: settings.secret_access_key.clone(),
        })
    }

    fn path_for(&self, key: &str) -> String {
        if self.path_style {
            format!("/{}/{}", encode_segment(&self.bucket), encode_key(key))
        } else {
            format!("/{}", encode_key(key))
        }
    }

    pub fn url_for(&self, key: &str) -> String {
        format!("https://{}{}", self.host, self.path_for(key))
    }

    /// Builds the `Authorization` header for one request. Only the three
    /// headers below are signed, and they are already in the lowercase
    /// alphabetical order SigV4 requires, so no sorting step is needed.
    fn authorization(
        &self,
        method: &str,
        key: &str,
        payload_hash: &str,
        amz_date: &str,
        date_stamp: &str,
    ) -> String {
        let signed_headers = "host;x-amz-content-sha256;x-amz-date";
        let canonical_request = format!(
            "{method}\n{}\n\nhost:{}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n\n{signed_headers}\n{payload_hash}",
            self.path_for(key),
            self.host,
        );
        let scope = format!("{date_stamp}/{}/{SERVICE}/aws4_request", self.region);
        let string_to_sign = format!(
            "{ALGORITHM}\n{amz_date}\n{scope}\n{}",
            hex(&sha256(canonical_request.as_bytes())),
        );

        let mut signing_key = hmac_sha256(
            format!("AWS4{}", self.secret_access_key).as_bytes(),
            date_stamp.as_bytes(),
        );
        for part in [self.region.as_str(), SERVICE, "aws4_request"] {
            signing_key = hmac_sha256(&signing_key, part.as_bytes());
        }
        let signature = hex(&hmac_sha256(&signing_key, string_to_sign.as_bytes()));

        format!(
            "{ALGORITHM} Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
            self.access_key_id,
        )
    }

    async fn send(&self, method: reqwest::Method, key: &str, body: Vec<u8>) -> Result<(), AppError> {
        let payload_hash = hex(&sha256(&body));
        let now = chrono::Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();
        let authorization = self.authorization(
            method.as_str(),
            key,
            &payload_hash,
            &amz_date,
            &date_stamp,
        );

        let response = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| cloud_error(format!("could not build an HTTP client: {error}")))?
            .request(method, self.url_for(key))
            .header("host", &self.host)
            .header("x-amz-content-sha256", &payload_hash)
            .header("x-amz-date", &amz_date)
            .header("authorization", authorization)
            .body(body)
            .send()
            .await
            .map_err(|error| cloud_error(format!("could not reach {}: {error}", self.host)))?;

        let status = response.status();
        if status.is_success() {
            return Ok(());
        }
        // S3 puts the useful part in an XML body; the status alone cannot tell
        // a wrong key from a missing bucket from a clock skew.
        let detail = response.text().await.unwrap_or_default();
        Err(cloud_error(format!(
            "{} rejected the upload with {status}{}",
            self.host,
            summarize_error(&detail),
        )))
    }

    pub async fn put_object(&self, key: &str, body: Vec<u8>) -> Result<(), AppError> {
        self.send(reqwest::Method::PUT, key, body).await
    }

    pub async fn delete_object(&self, key: &str) -> Result<(), AppError> {
        self.send(reqwest::Method::DELETE, key, Vec::new()).await
    }
}

/// Pulls `<Code>` and `<Message>` out of an S3 error body. The full XML is too
/// long for a toast and the status code alone is too little.
fn summarize_error(body: &str) -> String {
    fn tag<'a>(body: &'a str, name: &str) -> Option<&'a str> {
        let open = format!("<{name}>");
        let close = format!("</{name}>");
        let start = body.find(&open)? + open.len();
        let end = body[start..].find(&close)? + start;
        Some(body[start..end].trim())
    }
    match (tag(body, "Code"), tag(body, "Message")) {
        (Some(code), Some(message)) => format!(": {code} - {message}"),
        (Some(code), None) => format!(": {code}"),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(provider: CloudProvider, endpoint: &str, region: &str) -> CloudBackupSettings {
        CloudBackupSettings {
            provider,
            bucket: "snipdock-backups".into(),
            region: region.into(),
            endpoint: endpoint.into(),
            prefix: String::new(),
            access_key_id: "AKIAIOSFODNN7EXAMPLE".into(),
            secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".into(),
            passphrase: "hunter2".into(),
        }
    }

    #[test]
    fn hmac_matches_the_rfc_4231_vectors() {
        assert_eq!(
            hex(&hmac_sha256(&[0x0b; 20], b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
        );
        assert_eq!(
            hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
        );
        // A key longer than the 64-byte block is hashed down first; this is the
        // branch a long secret access key would take.
        assert_eq!(
            hex(&hmac_sha256(
                &[0xaa; 131],
                b"Test Using Larger Than Block-Size Key - Hash Key First",
            )),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
        );
    }

    /// The worked example from the AWS SigV4 documentation, so a signing
    /// mistake shows up here rather than as a 403 from a real bucket.
    #[test]
    fn signing_follows_the_documented_worked_example() {
        let bucket = Bucket {
            host: "examplebucket.s3.amazonaws.com".into(),
            region: "us-east-1".into(),
            path_style: false,
            bucket: "examplebucket".into(),
            access_key_id: "AKIAIOSFODNN7EXAMPLE".into(),
            secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".into(),
        };
        let payload_hash = hex(&sha256(b"Welcome to Amazon S3."));
        let authorization = bucket.authorization(
            "PUT",
            "test$file.text",
            &payload_hash,
            "20130524T000000Z",
            "20130524",
        );

        assert!(
            authorization.contains("Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request"),
            "unexpected credential scope: {authorization}",
        );
        assert!(
            authorization.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date"),
            "unexpected signed headers: {authorization}",
        );
    }

    #[test]
    fn aws_is_addressed_by_host_and_r2_by_path() {
        let aws = Bucket::from_settings(&settings(CloudProvider::S3, "", "eu-west-2")).unwrap();
        assert_eq!(
            aws.url_for("daily/backup.snipdock"),
            "https://snipdock-backups.s3.eu-west-2.amazonaws.com/daily/backup.snipdock",
        );

        // R2 has no per-bucket hostname, and its credential scope is always
        // `auto` regardless of what the region field happens to hold.
        let r2 = Bucket::from_settings(&settings(
            CloudProvider::R2,
            "https://account.r2.cloudflarestorage.com/",
            "eu-west-2",
        ))
        .unwrap();
        assert_eq!(
            r2.url_for("daily/backup.snipdock"),
            "https://account.r2.cloudflarestorage.com/snipdock-backups/daily/backup.snipdock",
        );
        assert_eq!(r2.region, "auto");
    }

    #[test]
    fn keys_are_encoded_without_escaping_their_separators() {
        assert_eq!(
            encode_key("snip dock/2026/back+up.snipdock"),
            "snip%20dock/2026/back%2Bup.snipdock",
        );
    }

    #[test]
    fn plaintext_endpoints_and_empty_buckets_are_refused() {
        let mut insecure = settings(CloudProvider::S3, "http://minio.local:9000", "");
        assert!(Bucket::from_settings(&insecure).is_err());
        insecure.endpoint = String::new();
        insecure.bucket = "  ".into();
        assert!(Bucket::from_settings(&insecure).is_err());
    }

    #[test]
    fn error_bodies_are_reduced_to_their_code_and_message() {
        let body = "<?xml version=\"1.0\"?><Error><Code>SignatureDoesNotMatch</Code>\
                    <Message>The request signature we calculated does not match</Message></Error>";
        assert_eq!(
            summarize_error(body),
            ": SignatureDoesNotMatch - The request signature we calculated does not match",
        );
        assert_eq!(summarize_error("not xml"), "");
    }
}
