export function isAllowedUrl(value) {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (/[\\]/.test(value)) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
