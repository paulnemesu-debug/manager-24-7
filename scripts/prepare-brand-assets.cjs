// Generate platform sizes from the approved logo artwork using Expo's asset pipeline.
const fs = require('node:fs/promises');
const path = require('node:path');
const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = require('@expo/image-utils');

async function main() {
  const projectRoot = process.cwd();
  const output = path.join(projectRoot, 'assets', 'brand');
  const src = path.join(output, 'manager247-logo-clear.png');
  const render = async (width, backgroundColor = 'transparent') => (await generateImageAsync(
    { projectRoot }, { src, width, height: width, resizeMode: 'contain', backgroundColor },
  )).source;
  const icon = await render(1024, '#FFFFFF');
  await fs.writeFile(path.join(output, 'manager247-app-icon.png'), icon);
  await fs.writeFile(path.join(output, 'manager247-app-icon.optimized.png'), icon);
  // Keep the full circular artwork within Android's central adaptive-icon safe area.
  const foreground = await render(660);
  const background = await generateImageBackgroundAsync({ width: 1024, height: 1024, backgroundColor: 'transparent' });
  const adaptive = await compositeImagesAsync({ foreground, background, x: 182, y: 182 });
  await fs.writeFile(path.join(output, 'manager247-adaptive-foreground.png'), adaptive);
  if (process.argv.includes('--android')) {
    const config = require('../app.json').expo;
    const { setIconAsync } = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');
    await setIconAsync(projectRoot, { icon: config.icon, ...config.android.adaptiveIcon, isAdaptive: true });
    const colorsFile = path.join(projectRoot, 'android/app/src/main/res/values/colors.xml');
    const colors = (await fs.readFile(colorsFile, 'utf8'))
      .replace(/(<color name="iconBackground">)[^<]+/, `$1${config.android.adaptiveIcon.backgroundColor}`);
    await fs.writeFile(colorsFile, colors);
  }
  console.log('Generated phone launcher icon assets.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
