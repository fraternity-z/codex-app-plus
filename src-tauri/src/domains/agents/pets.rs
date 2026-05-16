use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose, Engine as _};
use serde::Deserialize;

use super::models::{CustomPetOutput, CustomPetsOutput, ListCustomPetsInput};
use crate::error::{AppError, AppResult};
use crate::infra::filesystem::agent_environment::resolve_codex_home_relative_path;

const AVATARS_DIR: &str = ".codex/avatars";
const PETS_DIR: &str = ".codex/pets";
const AVATAR_MANIFEST: &str = "avatar.json";
const PET_MANIFEST: &str = "pet.json";
const DEFAULT_SPRITESHEET_PATH: &str = "spritesheet.webp";
const SPRITESHEET_WIDTH: u32 = 1536;
const SPRITESHEET_HEIGHT: u32 = 1872;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default = "default_spritesheet_path")]
    spritesheet_path: String,
}

struct ImageInfo {
    mime_type: &'static str,
    width: u32,
    height: u32,
}

pub fn list_custom_pets(input: ListCustomPetsInput) -> AppResult<CustomPetsOutput> {
    let avatars_dir = resolve_codex_home_relative_path(input.agent_environment, AVATARS_DIR)?;
    let pets_dir = resolve_codex_home_relative_path(input.agent_environment, PETS_DIR)?;
    list_custom_pets_in(
        &avatars_dir.host_path,
        &pets_dir.display_path,
        &pets_dir.host_path,
    )
}

fn list_custom_pets_in(
    avatars_dir: &Path,
    pet_display_dir: &str,
    pets_dir: &Path,
) -> AppResult<CustomPetsOutput> {
    fs::create_dir_all(pets_dir)?;

    let mut by_id = HashMap::<String, CustomPetOutput>::new();
    for avatar in discover_custom_pets_in(avatars_dir, AVATAR_MANIFEST)? {
        by_id.insert(avatar.id.clone(), avatar);
    }
    for pet in discover_custom_pets_in(pets_dir, PET_MANIFEST)? {
        by_id.insert(pet.id.clone(), pet);
    }

    let mut avatars: Vec<CustomPetOutput> = by_id.into_values().collect();
    avatars.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(CustomPetsOutput {
        avatar_directory: pet_display_dir.to_string(),
        avatars,
    })
}

fn discover_custom_pets_in(
    directory: &Path,
    manifest_name: &str,
) -> AppResult<Vec<CustomPetOutput>> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };

    let mut pets = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let Some(folder_name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        match read_custom_pet_dir(&entry.path(), &folder_name, manifest_name) {
            Ok(Some(pet)) => pets.push(pet),
            Ok(None) => {}
            Err(_) => {}
        }
    }

    Ok(pets)
}

fn read_custom_pet_dir(
    directory: &Path,
    folder_name: &str,
    manifest_name: &str,
) -> AppResult<Option<CustomPetOutput>> {
    let manifest_path = directory.join(manifest_name);
    let manifest_text = match fs::read_to_string(&manifest_path) {
        Ok(value) => value,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let manifest: PetManifest = serde_json::from_str(&manifest_text)?;
    let spritesheet_path = resolve_spritesheet_path(directory, &manifest.spritesheet_path)?;
    let spritesheet_bytes = fs::read(&spritesheet_path)?;
    let image_info = detect_supported_image(&spritesheet_bytes)?;
    if image_info.width != SPRITESHEET_WIDTH || image_info.height != SPRITESHEET_HEIGHT {
        return Err(AppError::InvalidInput(format!(
            "pet spritesheet dimensions must be {SPRITESHEET_WIDTH}x{SPRITESHEET_HEIGHT}"
        )));
    }

    Ok(Some(CustomPetOutput {
        id: format!("custom:{folder_name}"),
        display_name: first_non_empty([
            manifest.display_name.as_deref(),
            manifest.id.as_deref(),
            Some(folder_name),
        ])
        .to_string(),
        description: manifest.description.and_then(trim_optional_string),
        spritesheet_data_url: format!(
            "data:{};base64,{}",
            image_info.mime_type,
            general_purpose::STANDARD.encode(spritesheet_bytes)
        ),
    }))
}

fn resolve_spritesheet_path(directory: &Path, spritesheet_path: &str) -> AppResult<PathBuf> {
    let trimmed = spritesheet_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(
            "spritesheetPath 不能为空".to_string(),
        ));
    }
    let relative_path = Path::new(trimmed);
    if relative_path.is_absolute() {
        return Err(AppError::InvalidInput(
            "spritesheetPath 必须位于宠物目录内".to_string(),
        ));
    }

    let directory = fs::canonicalize(directory)?;
    let spritesheet_path = fs::canonicalize(directory.join(relative_path))?;
    if !spritesheet_path.starts_with(&directory) {
        return Err(AppError::InvalidInput(
            "spritesheetPath 必须位于宠物目录内".to_string(),
        ));
    }
    Ok(spritesheet_path)
}

fn detect_supported_image(bytes: &[u8]) -> AppResult<ImageInfo> {
    if let Some((width, height)) = png_dimensions(bytes) {
        return Ok(ImageInfo {
            mime_type: "image/png",
            width,
            height,
        });
    }
    if let Some((width, height)) = webp_dimensions(bytes) {
        return Ok(ImageInfo {
            mime_type: "image/webp",
            width,
            height,
        });
    }
    Err(AppError::InvalidInput(
        "pet spritesheet must be a PNG or WebP image".to_string(),
    ))
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < 24 || &bytes[..8] != PNG_SIGNATURE {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((width, height))
}

fn webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 20 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }

    let mut offset = 12usize;
    while offset.checked_add(8)? <= bytes.len() {
        let chunk_tag = &bytes[offset..offset + 4];
        let chunk_size = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().ok()?);
        let chunk_start = offset + 8;
        let chunk_len = usize::try_from(chunk_size).ok()?;
        let chunk_end = chunk_start.checked_add(chunk_len)?;
        if chunk_end > bytes.len() {
            return None;
        }

        let chunk = &bytes[chunk_start..chunk_end];
        if chunk_tag == b"VP8X" {
            return webp_vp8x_dimensions(chunk);
        }
        if chunk_tag == b"VP8L" {
            return webp_vp8l_dimensions(chunk);
        }
        if chunk_tag == b"VP8 " {
            return webp_vp8_dimensions(chunk);
        }

        offset = chunk_end + usize::from(chunk_size % 2 == 1);
    }

    None
}

fn webp_vp8x_dimensions(chunk: &[u8]) -> Option<(u32, u32)> {
    if chunk.len() < 10 {
        return None;
    }
    let width = read_u24_le(&chunk[4..7])?.checked_add(1)?;
    let height = read_u24_le(&chunk[7..10])?.checked_add(1)?;
    Some((width, height))
}

fn webp_vp8l_dimensions(chunk: &[u8]) -> Option<(u32, u32)> {
    if chunk.len() < 5 || chunk[0] != 0x2f {
        return None;
    }
    let bits = u32::from_le_bytes(chunk[1..5].try_into().ok()?);
    let width = (bits & 0x3fff).checked_add(1)?;
    let height = ((bits >> 14) & 0x3fff).checked_add(1)?;
    Some((width, height))
}

fn webp_vp8_dimensions(chunk: &[u8]) -> Option<(u32, u32)> {
    if chunk.len() < 10 || chunk[3..6] != [0x9d, 0x01, 0x2a] {
        return None;
    }
    let width = u16::from_le_bytes(chunk[6..8].try_into().ok()?) & 0x3fff;
    let height = u16::from_le_bytes(chunk[8..10].try_into().ok()?) & 0x3fff;
    Some((u32::from(width), u32::from(height)))
}

fn read_u24_le(bytes: &[u8]) -> Option<u32> {
    if bytes.len() != 3 {
        return None;
    }
    Some(u32::from(bytes[0]) | (u32::from(bytes[1]) << 8) | (u32::from(bytes[2]) << 16))
}

fn first_non_empty<'a>(values: impl IntoIterator<Item = Option<&'a str>>) -> &'a str {
    values
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .unwrap_or("Custom pet")
}

fn trim_optional_string(value: String) -> Option<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn default_spritesheet_path() -> String {
    DEFAULT_SPRITESHEET_PATH.to_string()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        list_custom_pets_in, png_dimensions, webp_dimensions, PET_MANIFEST, SPRITESHEET_HEIGHT,
        SPRITESHEET_WIDTH,
    };

    fn unique_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("codex-app-plus-{name}-{timestamp}"))
    }

    fn cleanup(path: &Path) {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
            return;
        }
        let _ = fs::remove_file(path);
    }

    fn make_vp8x_webp(width: u32, height: u32) -> Vec<u8> {
        let width_minus_one = width - 1;
        let height_minus_one = height - 1;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&22u32.to_le_bytes());
        bytes.extend_from_slice(b"WEBP");
        bytes.extend_from_slice(b"VP8X");
        bytes.extend_from_slice(&10u32.to_le_bytes());
        bytes.extend_from_slice(&[0, 0, 0, 0]);
        bytes.extend_from_slice(&[
            (width_minus_one & 0xff) as u8,
            ((width_minus_one >> 8) & 0xff) as u8,
            ((width_minus_one >> 16) & 0xff) as u8,
        ]);
        bytes.extend_from_slice(&[
            (height_minus_one & 0xff) as u8,
            ((height_minus_one >> 8) & 0xff) as u8,
            ((height_minus_one >> 16) & 0xff) as u8,
        ]);
        bytes
    }

    #[test]
    fn parses_png_dimensions() {
        let mut png = vec![0u8; 24];
        png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        png[16..20].copy_from_slice(&SPRITESHEET_WIDTH.to_be_bytes());
        png[20..24].copy_from_slice(&SPRITESHEET_HEIGHT.to_be_bytes());

        assert_eq!(
            png_dimensions(&png),
            Some((SPRITESHEET_WIDTH, SPRITESHEET_HEIGHT)),
        );
    }

    #[test]
    fn parses_webp_vp8x_dimensions() {
        assert_eq!(
            webp_dimensions(&make_vp8x_webp(SPRITESHEET_WIDTH, SPRITESHEET_HEIGHT)),
            Some((SPRITESHEET_WIDTH, SPRITESHEET_HEIGHT)),
        );
    }

    #[test]
    fn reads_custom_pets_and_overrides_legacy_avatars() {
        let root = unique_path("pets");
        let avatars_dir = root.join("avatars");
        let pets_dir = root.join("pets");
        fs::create_dir_all(avatars_dir.join("001")).expect("create avatar dir");
        fs::create_dir_all(pets_dir.join("001")).expect("create pet dir");
        fs::write(
            avatars_dir.join("001").join("avatar.json"),
            r#"{"displayName":"Old 001","spritesheetPath":"spritesheet.webp"}"#,
        )
        .expect("write avatar manifest");
        fs::write(
            pets_dir.join("001").join(PET_MANIFEST),
            r#"{"id":"001","displayName":"001","description":"Snow star","spritesheetPath":"spritesheet.webp"}"#,
        )
        .expect("write pet manifest");
        fs::write(
            avatars_dir.join("001").join("spritesheet.webp"),
            make_vp8x_webp(SPRITESHEET_WIDTH, SPRITESHEET_HEIGHT),
        )
        .expect("write avatar spritesheet");
        fs::write(
            pets_dir.join("001").join("spritesheet.webp"),
            make_vp8x_webp(SPRITESHEET_WIDTH, SPRITESHEET_HEIGHT),
        )
        .expect("write pet spritesheet");

        let output = list_custom_pets_in(&avatars_dir, "~/.codex/pets", &pets_dir)
            .expect("list custom pets");

        assert_eq!(output.avatar_directory, "~/.codex/pets");
        assert_eq!(output.avatars.len(), 1);
        assert_eq!(output.avatars[0].id, "custom:001");
        assert_eq!(output.avatars[0].display_name, "001");
        assert_eq!(output.avatars[0].description.as_deref(), Some("Snow star"));
        assert!(output.avatars[0]
            .spritesheet_data_url
            .starts_with("data:image/webp;base64,"));
        cleanup(&root);
    }
}
