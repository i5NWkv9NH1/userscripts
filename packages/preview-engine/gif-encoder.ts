// * 纯 TypeScript GIF89a 编码器：把浏览器本地 blob 视频帧转成真正可保存的 .gif 动图（无需外部库）

function writeLzwGifData(indexedPixels: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out: number[] = [];

  let curByte = 0;
  let curBits = 0;

  const emitBits = (code: number, width: number) => {
    curByte |= code << curBits;
    curBits += width;
    while (curBits >= 8) {
      out.push(curByte & 0xff);
      curByte >>= 8;
      curBits -= 8;
    }
  };

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const dict = new Map<number, number>();

  const resetDict = () => {
    dict.clear();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  emitBits(clearCode, codeSize);
  let prefix = indexedPixels[0] ?? 0;

  for (let i = 1; i < indexedPixels.length; i++) {
    const k = indexedPixels[i]!;
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
    } else {
      emitBits(prefix, codeSize);
      if (nextCode < 4096) {
        dict.set(key, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      } else {
        emitBits(clearCode, codeSize);
        resetDict();
      }
      prefix = k;
    }
  }

  emitBits(prefix, codeSize);
  emitBits(eoiCode, codeSize);
  if (curBits > 0) {
    out.push(curByte & 0xff);
  }
  return out;
}

// * 使用 6x8x5 均匀量化 + Floyd-Steinberg 误差扩散（240 色调色板），兼顾编码速度与清晰度
function quantizeFrameRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): {
  palette: Uint8Array;
  indexed: Uint8Array;
} {
  const palette = new Uint8Array(256 * 3);
  let p = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 5; b++) {
        palette[p++] = Math.round((r * 255) / 5);
        palette[p++] = Math.round((g * 255) / 7);
        palette[p++] = Math.round((b * 255) / 4);
      }
    }
  }

  const total = width * height;
  const buf = new Float32Array(total * 3);
  for (let i = 0; i < total; i++) {
    buf[i * 3] = rgba[i * 4]!;
    buf[i * 3 + 1] = rgba[i * 4 + 1]!;
    buf[i * 3 + 2] = rgba[i * 4 + 2]!;
  }

  const indexed = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const r0 = Math.max(0, Math.min(255, buf[idx * 3]!));
      const g0 = Math.max(0, Math.min(255, buf[idx * 3 + 1]!));
      const b0 = Math.max(0, Math.min(255, buf[idx * 3 + 2]!));

      const ri = Math.round((r0 * 5) / 255);
      const gi = Math.round((g0 * 7) / 255);
      const bi = Math.round((b0 * 4) / 255);
      const palIdx = ri * 40 + gi * 5 + bi;
      indexed[idx] = palIdx;

      const er = r0 - palette[palIdx * 3]!;
      const eg = g0 - palette[palIdx * 3 + 1]!;
      const eb = b0 - palette[palIdx * 3 + 2]!;

      const spread = (nx: number, ny: number, weight: number) => {
        if (nx < 0 || nx >= width || ny >= height) return;
        const nIdx = (ny * width + nx) * 3;
        buf[nIdx] = (buf[nIdx] ?? 0) + er * weight;
        buf[nIdx + 1] = (buf[nIdx + 1] ?? 0) + eg * weight;
        buf[nIdx + 2] = (buf[nIdx + 2] ?? 0) + eb * weight;
      };

      spread(x + 1, y, 7 / 16);
      spread(x - 1, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + 1, y + 1, 1 / 16);
    }
  }

  return { palette, indexed };
}

function pushWordLE(out: number[], val: number): void {
  out.push(val & 0xff, (val >> 8) & 0xff);
}

export async function convertMp4BlobToGif(
  mp4Blob: Blob,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(mp4Blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('视频读取超时')), 15000);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('视频解码失败'));
      };
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2;
    const maxWidth = 480;
    const rawW = video.videoWidth || 480;
    const rawH = video.videoHeight || 270;
    const scale = rawW > maxWidth ? maxWidth / rawW : 1;
    const w = Math.max(16, Math.round(rawW * scale));
    const h = Math.max(16, Math.round(rawH * scale));

    // ! 限制最大帧数（约 12fps、上限 140 帧），防止超长视频导致内存暴涨
    const fps = 12;
    const totalFrames = Math.max(2, Math.min(140, Math.round(duration * fps)));
    const delayCs = Math.max(3, Math.round(100 / fps));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法创建画布');

    const bytes: number[] = [];
    // GIF89a header
    bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
    pushWordLE(bytes, w);
    pushWordLE(bytes, h);
    bytes.push(0x77, 0x00, 0x00); // * no GCT, 8-bit color resolution

    // Netscape 2.0 infinite loop extension
    bytes.push(
      0x21,
      0xff,
      0x0b,
      0x4e,
      0x45,
      0x54,
      0x53,
      0x43,
      0x41,
      0x50,
      0x45,
      0x32,
      0x2e,
      0x30,
      0x03,
      0x01,
      0x00,
      0x00,
      0x00
    );

    for (let i = 0; i < totalFrames; i++) {
      const targetTime = Math.min(duration - 0.02, (i / totalFrames) * duration);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 600);
        video.onseeked = () => {
          clearTimeout(timer);
          resolve();
        };
        video.currentTime = Math.max(0, targetTime);
      });

      ctx.drawImage(video, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const { palette, indexed } = quantizeFrameRgba(imgData.data, w, h);

      // Graphic Control Extension
      bytes.push(0x21, 0xf9, 0x04, 0x00);
      pushWordLE(bytes, delayCs);
      bytes.push(0x00, 0x00);

      // Image Descriptor with Local Color Table (256 colors)
      bytes.push(0x2c);
      pushWordLE(bytes, 0);
      pushWordLE(bytes, 0);
      pushWordLE(bytes, w);
      pushWordLE(bytes, h);
      bytes.push(0x87); // * local color table = 256 colors

      for (let p = 0; p < palette.length; p++) {
        bytes.push(palette[p]!);
      }

      const minCodeSize = 8;
      bytes.push(minCodeSize);
      const lzw = writeLzwGifData(indexed, minCodeSize);
      for (let offset = 0; offset < lzw.length; offset += 255) {
        const chunk = lzw.slice(offset, offset + 255);
        bytes.push(chunk.length, ...chunk);
      }
      bytes.push(0x00);

      onProgress?.(Math.round(((i + 1) / totalFrames) * 100));
    }

    bytes.push(0x3b); // GIF trailer
    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
