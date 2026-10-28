# Logo revision for v1.6.1

Requested change: remove the blue surrounding the phone launcher icon so “Manager 24/7” is easier to read. Applied only to the phone icon; lettering and the brand symbol retain their navy and gold colors. The splash screen, in-app logo and web icons retain their previous appearance.

The artwork was edited with Codex's built-in image generation tool, using the original `manager247-logo-transparent.png` as the edit target. The final artwork is `assets/brand/manager247-logo-clear.png`. Expo's image utilities generate the platform sizes; no external image URL is needed at runtime.

Edit prompt: Precisely edit the existing circular PARADIM MANAGER 24/7 logo. Remove only the thick navy outer halo/border. Outside the thin gold circle must be genuinely transparent. Keep the white interior, thin gold circle, original symbol, lettering and exact text “PARADIM”, “MANAGER”, “24/7”. Preserve navy inside the symbol and letters. Center the full circle, filling about 96% of the square, without an outside shadow or any cropped lettering.

Run `node scripts/prepare-brand-assets.cjs --android` after installing the locked dependencies to regenerate the source launcher images and native Android icon resources. Android adaptive artwork is padded within the central safe area; the launcher icon background is white.

The source PNGs were visually inspected. Physical-phone rendering remains to be checked on a device.
