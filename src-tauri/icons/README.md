# Icons placeholder

Icon placeholder — run `cargo tauri icon path/to/source.png` to generate real icons.

The Tauri bundler expects `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and `icon.ico` in this directory. None have been generated yet; the M3.11 verification doc will cover icon generation on a Rust-enabled machine.

Until then, `pnpm tauri build` will fail at the bundle step with a missing-icon error. `pnpm tauri dev` and the binary build work without icons.
