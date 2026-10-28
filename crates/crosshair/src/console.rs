//! Crosshairs written as console commands, the way players share them for the console or an autoexec:
//! `citadel_crosshair_dot_size 4; citadel_crosshair_color_r 245; citadel_crosshair_pip_gap_static true`.

use super::CrosshairError;
use super::settings::{Settings, convar_hash};

/// Reads `<convar> <value>` commands separated by `;` or new lines. Convars that are not crosshair settings are
/// ignored, and values are read the way the game reads them (`1.8` for an integer setting is 1).
pub(super) fn parse(commands: &str) -> Result<Settings, CrosshairError> {
    let mut settings = Settings::default();
    let mut recognised = false;
    for command in commands.split([';', '\n']) {
        let mut parts = command.split_whitespace();
        let (Some(name), Some(value)) = (parts.next(), parts.next()) else {
            continue;
        };
        let name = name.strip_prefix("citadel_").unwrap_or(name);
        if name.starts_with("crosshair_") {
            recognised |= settings.apply(convar_hash(name), value.trim_matches('"'));
        }
    }
    if recognised {
        Ok(settings)
    } else {
        Err(CrosshairError::NotACode)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shared_console_commands() {
        let settings = parse(
            "citadel_crosshair_color_r 245; citadel_crosshair_color_g 188; citadel_crosshair_color_b 188; \
             citadel_crosshair_pip_gap_static true; citadel_crosshair_disable_hero_specific_crosshairs true; \
             citadel_crosshair_pip_opacity 1; citadel_crosshair_pip_width 1.8; citadel_crosshair_pip_height 5.6; \
             citadel_crosshair_pip_gap 1; citadel_crosshair_dot_opacity 0; citadel_crosshair_dot_outline_opacity 0; \
             citadel_crosshair_dot_outline_gap 0; citadel_crosshair_dot_outline_border 2; citadel_crosshair_dot_size 4; \
             citadel_crosshair_outline_color_r 128; citadel_crosshair_outline_color_g 255; \
             citadel_crosshair_outline_color_b 234; citadel_crosshair_pip_outline_opacity 1; \
             citadel_crosshair_pip_outline_border 1; citadel_crosshair_pip_outline_gap 0",
        )
        .unwrap();
        assert_eq!(
            settings,
            Settings {
                color_r: 245,
                color_g: 188,
                color_b: 188,
                pip_gap_static: true,
                pip_opacity: 1.0,
                pip_width: 1,
                pip_height: 5,
                pip_gap: 1,
                dot_opacity: 0.0,
                dot_outline_opacity: 0.0,
                outline_color_r: 128,
                outline_color_g: 255,
                outline_color_b: 234,
                pip_outline_opacity: 1.0,
                ..Settings::default()
            }
        );
    }

    #[test]
    fn accepts_lines_quotes_and_the_short_name() {
        let settings = parse("crosshair_dot_size \"7\"\ncitadel_crosshair_color_g 0").unwrap();
        assert_eq!(settings.dot_size, 7);
        assert_eq!(settings.color_g, 0);
    }

    #[test]
    fn rejects_text_without_crosshair_commands() {
        assert!(matches!(
            parse("hello world"),
            Err(CrosshairError::NotACode)
        ));
        assert!(matches!(
            parse("sv_cheats 1"),
            Err(CrosshairError::NotACode)
        ));
    }
}
