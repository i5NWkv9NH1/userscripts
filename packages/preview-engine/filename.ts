// * 从网址里提取网站原本的文件名（例如 X 的 HX9az8QbkAEcFn5?format=jpg -> HX9az8QbkAEcFn5.jpg）
export function extractOriginalFileParts(
  mediaUrl: string,
  fallbackExt = 'jpg'
): { name: string; ext: string } {
  let name = 'media';
  let ext = fallbackExt;
  try {
    const u = new URL(mediaUrl, 'https://localhost');
    const formatParam = u.searchParams.get('format');
    const lastSeg = u.pathname.split('/').filter(Boolean).pop() ?? 'media';
    const cleanSeg = lastSeg.replace(/:[a-z0-9_]+$/i, '');
    const dotIdx = cleanSeg.lastIndexOf('.');
    if (dotIdx > 0) {
      name = cleanSeg.slice(0, dotIdx);
      const pathExt = cleanSeg.slice(dotIdx + 1).toLowerCase();
      if (pathExt) ext = pathExt;
    } else if (cleanSeg) {
      name = cleanSeg;
    }
    if (formatParam) {
      ext = formatParam.toLowerCase();
    }
  } catch {}
  return { name, ext };
}

export function formatDownloadFilename(
  template: string,
  mediaUrl: string,
  width: number,
  height: number,
  mimeExt?: string,
  hostname = 'localhost'
): string {
  const host = hostname.replace(/^www\./, '');
  const { name: rawName, ext: urlExt } = extractOriginalFileParts(mediaUrl, mimeExt || 'jpg');
  const ext = (mimeExt && mimeExt !== 'octet-stream' ? mimeExt : urlExt).replace('jpeg', 'jpg');

  const trimmed = template.trim();
  // * 默认使用网站原本的文件名（空模板或 {original}）
  if (!trimmed || trimmed === '{original}') {
    return `${rawName}.${ext}`;
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');

  const rendered = trimmed
    .replace(/\{original\}/gi, `${rawName}.${ext}`)
    .replace(/\{site\}|%\{website\}%/gi, host)
    .replace(/\{name\}|%\{name\}%/gi, rawName)
    .replace(/\{w\}|%\{w\}%/gi, String(width || 0))
    .replace(/\{h\}|%\{h\}%/gi, String(height || 0))
    .replace(/\{date\}|%\{date\}%/gi, date)
    .replace(/\{time\}|%\{time\}%/gi, time)
    .replace(/\{ext\}|%\{ext\}%/gi, ext);

  return /\.[a-z0-9]{2,5}$/i.test(rendered) ? rendered : `${rendered}.${ext}`;
}
