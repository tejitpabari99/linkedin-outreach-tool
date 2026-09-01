export function isAllowedUrl(value, { allowRelative = false } = {}) {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (/[\u0000-\u001F\u007F\\]/.test(value)) return false;
  if (value.startsWith('/')) return allowRelative && !value.startsWith('//');
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
