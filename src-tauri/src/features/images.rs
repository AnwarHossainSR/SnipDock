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

/// Suffix marking the downscaled copy of an image, kept beside the original.
const THUMB_SUFFIX: &str = ".thumb.png";

/// Longest edge of a generated thumbnail, in pixels. The history draws these
/// rows at 112px and the inspector at a few hundred, so 256 covers both at 2x
/// without decoding a full screenshot to paint a strip.
pub const THUMB_MAX_EDGE: u32 = 256;

/// Path stored in `items.content` for an image with this hash.
pub fn relative_path(hash: &str) -> String {
    format!("{IMAGE_DIR}/{hash}.png")
}

/// Path of the downscaled copy for an image with this hash. Derived from the
/// same hash rather than stored, so no schema change and no row to keep in
/// step with the file.
pub fn relative_thumb_path(hash: &str) -> String {
    format!("{IMAGE_DIR}/{hash}{THUMB_SUFFIX}")
}

/// The original a thumbnail belongs to, or `None` for a path that is not one.
/// The orphan sweep needs this: a thumbnail is never referenced by a row, so
/// it has to be judged by whether its original still is.
fn thumb_source(relative: &str) -> Option<String> {
    relative
        .strip_suffix(THUMB_SUFFIX)
        .map(|stem| format!("{stem}.png"))
}

/// Resolves a stored relative path against the app data dir, rejecting anything
/// that escapes the image directory. Paths come from the database rather than
/// from user input, but a corrupt row must not be able to reach arbitrary files.
pub fn resolve(data_dir: &Path, relative: &str) -> io::Result<PathBuf> {
    let (dir, file) = relative
        .split_once('/')
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "not an image path"))?;
    // A thumbnail is `<hash>.thumb.png`; strip that first so the hash check
    // below sees the same stem for both variants.
    let stem = file
        .strip_suffix(THUMB_SUFFIX)
        .or_else(|| file.strip_suffix(".png"));
    let valid = dir == IMAGE_DIR
        && stem.is_some_and(|stem| {
            !stem.is_empty() && stem.chars().all(|character| character.is_ascii_hexdigit())
        });
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
    std::fs::create_dir_all(data_dir.join(IMAGE_DIR))?;
    if !target.exists() {
        let encoded = encode_png(image)?;
        write_atomically(&target, &encoded)?;
    }
    // Written even when the original was already there, which is what backfills
    // a capture stored before thumbnails existed. A thumbnail that cannot be
    // written is not a failed capture: the history falls back to the original,
    // so the error is swallowed rather than losing the item.
    let thumb = resolve(data_dir, &relative_thumb_path(&hash))?;
    if !thumb.exists() {
        if let Ok(encoded) = encode_png(&downscale(image, THUMB_MAX_EDGE)) {
            let _ = write_atomically(&thumb, &encoded);
        }
    }
    Ok(relative)
}

/// Writes to a scratch name first, so a crash mid-write cannot leave a
/// truncated file sitting at a path that claims to hold those exact pixels.
fn write_atomically(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let scratch = target.with_extension("png.part");
    std::fs::write(&scratch, bytes)?;
    std::fs::rename(&scratch, target)
}

/// Area-average downscale to a longest edge of `max_edge`, returning the image
/// untouched when it is already small enough.
///
/// A box filter rather than nearest-neighbour: a screenshot of text reduced by
/// point-sampling is unreadable noise, and averaging is what makes a 112px row
/// of a 4K capture still recognisable as the thing that was copied.
fn downscale(image: &RawImage, max_edge: u32) -> RawImage {
    let longest = image.width.max(image.height);
    if longest <= max_edge || image.is_empty() {
        return image.clone();
    }
    let scale = f64::from(max_edge) / f64::from(longest);
    let width = ((f64::from(image.width) * scale).round() as u32).max(1);
    let height = ((f64::from(image.height) * scale).round() as u32).max(1);

    let mut out = vec![0_u8; (width as usize) * (height as usize) * 4];
    for y in 0..height {
        // The source box for this row, clamped so the last target pixel cannot
        // read past the final source row.
        let y0 = (u64::from(y) * u64::from(image.height) / u64::from(height)) as u32;
        let y1 = ((u64::from(y) + 1) * u64::from(image.height) / u64::from(height))
            .max(u64::from(y0) + 1)
            .min(u64::from(image.height)) as u32;
        for x in 0..width {
            let x0 = (u64::from(x) * u64::from(image.width) / u64::from(width)) as u32;
            let x1 = ((u64::from(x) + 1) * u64::from(image.width) / u64::from(width))
                .max(u64::from(x0) + 1)
                .min(u64::from(image.width)) as u32;

            let mut sums = [0_u64; 4];
            let mut count = 0_u64;
            for source_y in y0..y1 {
                for source_x in x0..x1 {
                    let at = ((source_y as usize) * (image.width as usize) + source_x as usize) * 4;
                    // A truncated buffer is a corrupt capture, not a panic.
                    let Some(pixel) = image.rgba.get(at..at + 4) else {
                        continue;
                    };
                    for channel in 0..4 {
                        sums[channel] += u64::from(pixel[channel]);
                    }
                    count += 1;
                }
            }
            let at = ((y as usize) * (width as usize) + x as usize) * 4;
            for channel in 0..4 {
                out[at + channel] = sums[channel]
                    .checked_div(count)
                    .unwrap_or(0) as u8;
            }
        }
    }
    RawImage::new(out, width, height)
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
        //
        // A thumbnail is never referenced by a row - nothing stores its path -
        // so it has to be judged by the original it was made from, or every
        // sweep would delete every thumbnail it found.
        let relative = format!("{IMAGE_DIR}/{name}");
        let judged_by = thumb_source(&relative).unwrap_or(relative);
        let orphaned =
            name.ends_with(".part") || (name.ends_with(".png") && !referenced.contains(&judged_by));
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
            .as_chunks::<3>()
            .0
            .iter()
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
            .collect(),
        png::ColorType::GrayscaleAlpha => buffer
            .as_chunks::<2>()
            .0
            .iter()
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

    /// A solid block of one colour, so a box-filtered downscale has an answer
    /// that can be asserted exactly.
    fn solid(width: u32, height: u32, colour: [u8; 4]) -> RawImage {
        let mut rgba = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            rgba.extend_from_slice(&colour);
        }
        RawImage::new(rgba, width, height)
    }

    #[test]
    fn storing_an_image_writes_a_thumbnail_beside_it() {
        let dir = scratch_dir();
        let image = solid(600, 300, [10, 20, 30, 255]);
        let relative = store(&dir, &image).unwrap();

        let hash = image.hash();
        assert_eq!(relative, relative_path(&hash));
        let thumb = resolve(&dir, &relative_thumb_path(&hash)).unwrap();
        assert!(thumb.exists(), "no thumbnail was written");

        let decoded = decode_png(&std::fs::read(&thumb).unwrap()).unwrap();
        assert_eq!(decoded.width, THUMB_MAX_EDGE);
        assert_eq!(decoded.height, THUMB_MAX_EDGE / 2);
        // Averaging a solid block has to give the block back.
        assert_eq!(&decoded.rgba[..4], &[10, 20, 30, 255]);
    }

    #[test]
    fn an_image_already_small_enough_is_not_enlarged() {
        let dir = scratch_dir();
        let image = solid(64, 32, [1, 2, 3, 255]);
        store(&dir, &image).unwrap();

        let thumb = resolve(&dir, &relative_thumb_path(&image.hash())).unwrap();
        let decoded = decode_png(&std::fs::read(&thumb).unwrap()).unwrap();
        assert_eq!((decoded.width, decoded.height), (64, 32));
    }

    /// A thumbnail written before the original existed, or for an image stored
    /// by an older build, is backfilled the next time the same pixels are
    /// captured.
    #[test]
    fn a_missing_thumbnail_is_backfilled_for_an_image_already_stored() {
        let dir = scratch_dir();
        let image = solid(600, 300, [9, 9, 9, 255]);
        store(&dir, &image).unwrap();
        let thumb = resolve(&dir, &relative_thumb_path(&image.hash())).unwrap();
        std::fs::remove_file(&thumb).unwrap();

        store(&dir, &image).unwrap();

        assert!(thumb.exists(), "thumbnail was not backfilled");
    }

    /// The sweep judges a file by whether a row references it, and no row ever
    /// references a thumbnail. Judging one directly would delete every
    /// thumbnail on the first sweep after it was written.
    #[test]
    fn the_sweep_keeps_a_thumbnail_whose_original_is_still_referenced() {
        let dir = scratch_dir();
        let image = solid(600, 300, [4, 5, 6, 255]);
        let relative = store(&dir, &image).unwrap();
        let thumb = resolve(&dir, &relative_thumb_path(&image.hash())).unwrap();

        let referenced = HashSet::from([relative.clone()]);
        let removed = sweep_orphans(&dir, &referenced).unwrap();

        assert_eq!(removed, 0);
        assert!(resolve(&dir, &relative).unwrap().exists());
        assert!(thumb.exists(), "the sweep deleted a live thumbnail");
    }

    #[test]
    fn the_sweep_removes_a_thumbnail_once_its_original_is_unreferenced() {
        let dir = scratch_dir();
        let image = solid(600, 300, [7, 7, 7, 255]);
        let relative = store(&dir, &image).unwrap();
        let thumb = resolve(&dir, &relative_thumb_path(&image.hash())).unwrap();

        let removed = sweep_orphans(&dir, &HashSet::new()).unwrap();

        assert_eq!(removed, 2, "original and thumbnail should both go");
        assert!(!resolve(&dir, &relative).unwrap().exists());
        assert!(!thumb.exists());
    }

    #[test]
    fn a_thumbnail_path_resolves_and_a_forged_one_does_not() {
        let dir = scratch_dir();
        assert!(resolve(&dir, &relative_thumb_path("abc123")).is_ok());
        assert!(resolve(&dir, "images/../secret.thumb.png").is_err());
        assert!(resolve(&dir, "images/not-hex.thumb.png").is_err());
        assert!(resolve(&dir, "images/.thumb.png").is_err());
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
        // One original and one thumbnail, and storing the same pixels twice
        // adds neither: the name is the content, so the second call finds both
        // files already there.
        assert_eq!(std::fs::read_dir(root.join(IMAGE_DIR)).unwrap().count(), 2);
        assert!(resolve(&root, &relative_thumb_path(&sample().hash())).unwrap().exists());
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

        // The unreferenced original, its thumbnail, and the scratch file. The
        // kept image's own thumbnail survives with it - see
        // `the_sweep_keeps_a_thumbnail_whose_original_is_still_referenced`.
        assert_eq!(removed, 3);
        assert!(resolve(&root, &kept).unwrap().exists());
        assert!(resolve(&root, &relative_thumb_path(&sample().hash())).unwrap().exists());
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
