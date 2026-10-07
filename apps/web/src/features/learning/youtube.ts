const VIDEO_ID = /^[A-Za-z0-9_-]{6,15}$/;

export function parseYouTubeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      id =
        url.pathname === '/watch'
          ? url.searchParams.get('v')
          : url.pathname.startsWith('/embed/')
            ? (url.pathname.split('/')[2] ?? null)
            : null;
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
