import sharp from 'sharp';

export async function optimize(bytes) {
  const image = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate().flatten({ background: '#fff' });
  const { data, info } = await image.resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const pixels = await sharp(data).resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
  let value = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const offset = row * 9 + col;
      value = (value << 1n) | BigInt(pixels[offset] > pixels[offset + 1]);
    }
  }
  return { data, width: info.width, height: info.height, visual: value.toString(16).padStart(16, '0') };
}

export async function preview(data) {
  return sharp(data).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
}

export function visualDistance(left, right) {
  let diff = BigInt('0x' + left) ^ BigInt('0x' + right);
  let bits = 0;
  while (diff) {
    diff &= diff - 1n;
    bits++;
  }
  return bits;
}
