// Generates deterministic, offline-safe SVG data-URI avatars so no external avatar DNS calls can fail

const AVATAR_PALETTES: [string, string][] = [
  ['#6366f1', '#8b5cf6'],
  ['#10b981', '#059669'],
  ['#0ea5e9', '#2563eb'],
  ['#ec4899', '#db2777'],
  ['#f59e0b', '#d97706'],
  ['#14b8a6', '#0d9488'],
];

export function generateLocalAvatar(name: string = 'U'): string {
  const clean = (name || 'U').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : clean.slice(0, 2).toUpperCase() || 'CR';

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) | 0;
  }
  const [c1, c2] = AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,sans-serif" font-size="48" font-weight="800">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function resolveAvatarUrl(avatar?: string, fallbackName: string = 'Usuário'): string {
  if (!avatar || avatar.includes('dicebear.com')) {
    return generateLocalAvatar(fallbackName);
  }
  return avatar;
}
