/*
  The iPhone launch pictures: the sign-in scene's navy with the app tile in the
  middle, one per iPhone screen size, so the home-screen app opens on its own
  colour instead of a white flash (app/layout.tsx lists them). Also the 192px
  maskable icon the manifest offers Android. Run once after the icon changes:
    node scripts/make-splash.mjs
*/
import sharp from "sharp";
import { mkdirSync } from "node:fs";

/* iPhone screens: points wide, points high, pixel ratio. Keep in step with SPLASH in app/layout.tsx. */
const SIZES = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3],
  [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2], [320, 568, 2],
];
const GROUND = { r: 6, g: 20, b: 43, alpha: 1 }; // #06142b, the sign-in scene the app opens on

mkdirSync("public/brand/splash", { recursive: true });
for (const [w, h, r] of SIZES) {
  const W = w * r, H = h * r;
  const tile = Math.round(Math.min(W, H) * 0.3);
  const radius = Math.round(tile * 0.225);
  const mask = Buffer.from(`<svg width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" rx="${radius}" fill="#fff"/></svg>`);
  const icon = await sharp("public/brand/app-512.png").resize(tile, tile).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: GROUND } })
    .composite([{ input: icon, left: Math.round((W - tile) / 2), top: Math.round((H - tile) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(`public/brand/splash/${w}x${h}@${r}.png`);
}
await sharp("public/brand/app-maskable-512.png").resize(192, 192).png().toFile("public/brand/app-maskable-192.png");
console.log("done");
