//! On-disk storage for clipboard images.
//!
//! Images never live in SQLite. The PNG bytes are written to
//! `<data_dir>/images/<sha256>.png` and only that relative path is stored in
//! `items.content`, so list queries stay cheap and the database file does not
//! grow by megabytes per screenshot.
//!
//! Naming files after the hash of their pixels makes the stored path a content
//! identity: two captures of the same image resolve to the same path, so the
//! existing text-based duplicate check in the capture pipeline works unchanged.

use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
};

/// Directory, relative to the app data dir, holding every captured image.
pub const IMAGE_DIR: &str = "images";

/// Raw RGBA pixels as handed over by the clipboard.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RawImage {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

impl RawImage {
    pub fn new(rgba: Vec<u8>, width: u32, height: u32) -> Self {
        Self {
            rgba,
            width,
            height,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.rgba.is_empty() || self.width == 0 || self.height == 0
    }

    /// Identity of the pixels, dimensions included so two images that share a
    /// byte buffer but not a shape cannot collide.
    pub fn hash(&self) -> String {
        let mut bytes = Vec::with_capacity(self.rgba.len() + 8);
        bytes.extend_from_slice(&self.width.to_le_bytes());
        bytes.extend_from_slice(&self.height.to_le_bytes());
        bytes.extend_from_slice(&self.rgba);
        crate::security::sha256_hex(&bytes)
    }
}

/// Path stored in `items.content` for an image with this hash.
pub fn relative_path(hash: &str) -> String {
    format!("{IMAGE_DIR}/{hash}.png")
}

/// Resolves a stored relative path against the app data dir, rejecting anything
/// that escapes the image directory. Paths come from the database rather than
/// from user input, but a corrupt row must not be able to reach arbitrary files.
pub fn resolve(data_dir: &Path, relative: &str) -> io::Result<PathBuf> {
    let (dir, file) = relative
        .split_once('/')
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "not an image path"))?;
    let valid = dir == IMAGE_DIR
        && file.ends_with(".png")
        && file
            .trim_end_matches(".png")
            .chars()
            .all(|character| character.is_ascii_hexdigit());
    if !valid {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not an image path",
        ));
    }
    Ok(data_dir.join(IMAGE_DIR).join(file))
}

/// Encodes and writes the image, returning the relative path to store. Writing
/// is skipped when the file already exists, since the name pins the content.
pub fn store(data_dir: &Path, image: &RawImage) -> io::Result<String> {
    let hash = image.hash();
    let relative = relative_path(&hash);
    let target = resolve(data_dir, &relative)?;
    if target.exists() {
        return Ok(relative);
    }
    std::fs::create_dir_all(data_dir.join(IMAGE_DIR))?;
    let encoded = encode_png(image)?;
    // Write to a scratch name first so a crash mid-write cannot leave a
    // truncated file sitting at a path that claims to hold those exact pixels.
    let scratch = target.with_extension("png.part");
    std::fs::write(&scratch, encoded)?;
    std::fs::rename(&scratch, &target)?;
    Ok(relative)
}

/// Reads back a stored image as raw pixels, ready to hand to the clipboard.
pub fn load(data_dir: &Path, relative: &str) -> io::Result<RawImage> {
    let bytes = std::fs::read(resolve(data_dir, relative)?)?;
    decode_png(&bytes)
}

/// Deletes image files no longer referenced by any row. Covers every path that
/// removes an item -- retention pruning, clear history, trash expiry, single
/// delete -- so none of them need their own cleanup step.
pub fn sweep_orphans(data_dir: &Path, referenced: &HashSet<String>) -> io::Result<usize> {
    let directory = data_dir.join(IMAGE_DIR);
    let entries = match std::fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error),
    };

    let mut removed = 0;
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        // `.part` leftovers belong to an interrupted write and are never
        // referenced, so they get swept on the same pass.
        let orphaned = name.ends_with(".part")
            || (name.ends_with(".png") && !referenced.contains(&format!("{IMAGE_DIR}/{name}")));
        if orphaned && std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

fn encode_png(image: &RawImage) -> io::Result<Vec<u8>> {
    let expected = (image.width as usize)
        .checked_mul(image.height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "image dimensions overflow"))?;
    if image.rgba.len() != expected {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "image buffer does not match its dimensions",
        ));
    }

    let mut encoded = Vec::new();
    let mut encoder = png::Encoder::new(&mut encoded, image.width, image.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|error| io::Error::other(error.to_string()))?;
    writer
        .write_image_data(&image.rgba)
        .map_err(|error| io::Error::other(error.to_string()))?;
    writer
        .finish()
        .map_err(|error| io::Error::other(error.to_string()))?;
    Ok(encoded)
}

fn decode_png(bytes: &[u8]) -> io::Result<RawImage> {
    let mut decoder = png::Decoder::new(io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder
        .read_info()
        .map_err(|error| io::Error::other(error.to_string()))?;
    let size = reader.output_buffer_size().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidData, "image is too large to decode")
    })?;
    let mut buffer = vec![0; size];
    let info = reader
        .next_frame(&mut buffer)
        .map_err(|error| io::Error::other(error.to_string()))?;
    buffer.truncate(info.buffer_size());

    // Everything written by `store` is RGBA, but a file could have been
    // replaced; widen the common greyscale/RGB cases rather than failing.
    let rgba = match info.color_type {
        png::ColorType::Rgba => buffer,
        png::ColorType::Rgb => buffer
            .chunks_exact(3)
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
            .collect(),
        png::ColorType::GrayscaleAlpha => buffer
            .chunks_exact(2)
            .flat_map(|pixel| [pixel[0], pixel[0], pixel[0], pixel[1]])
            .collect(),
        png::ColorType::Grayscale => buffer
            .iter()
            .flat_map(|&level| [level, level, level, 255])
            .collect(),
        png::ColorType::Indexed => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "indexed images are not supported",
            ))
        }
    };
    Ok(RawImage::new(rgba, info.width, info.height))
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn scratch_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("snipdock-images-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    fn sample() -> RawImage {
        RawImage::new(
            vec![
                255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128,
            ],
            2,
            2,
        )
    }

    #[test]
    fn store_then_load_round_trips_pixels() {
        let root = scratch_dir();
        let image = sample();

        let relative = store(&root, &image).unwrap();
        let loaded = load(&root, &relative).unwrap();

        assert_eq!(loaded, image);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn identical_pixels_reuse_one_file() {
        let root = scratch_dir();

        let first = store(&root, &sample()).unwrap();
        let second = store(&root, &sample()).unwrap();

        assert_eq!(first, second);
        assert_eq!(std::fs::read_dir(root.join(IMAGE_DIR)).unwrap().count(), 1);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn same_bytes_with_different_shape_hash_apart() {
        let flat = RawImage::new(sample().rgba, 4, 1);
        assert_ne!(sample().hash(), flat.hash());
    }

    #[test]
    fn sweep_removes_unreferenced_files_and_scratch_writes() {
        let root = scratch_dir();
        let kept = store(&root, &sample()).unwrap();
        let dropped = store(&root, &RawImage::new(vec![1, 2, 3, 4], 1, 1)).unwrap();
        std::fs::write(root.join(IMAGE_DIR).join("abc.png.part"), b"partial").unwrap();

        let referenced = HashSet::from([kept.clone()]);
        let removed = sweep_orphans(&root, &referenced).unwrap();

        assert_eq!(removed, 2);
        assert!(resolve(&root, &kept).unwrap().exists());
        assert!(!resolve(&root, &dropped).unwrap().exists());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn sweep_is_a_no_op_before_any_image_is_captured() {
        let root = scratch_dir();
        assert_eq!(sweep_orphans(&root, &HashSet::new()).unwrap(), 0);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn resolve_rejects_paths_outside_the_image_directory() {
        let root = scratch_dir();

        for candidate in [
            "images/../../secret.png",
            "elsewhere/abc.png",
            "images/abc.txt",
            "abc.png",
        ] {
            assert!(resolve(&root, candidate).is_err(), "accepted {candidate}");
        }
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn encoding_rejects_a_buffer_that_does_not_match_its_dimensions() {
        assert!(encode_png(&RawImage::new(vec![0; 8], 4, 4)).is_err());
    }
}
