import { describe, expect, it } from 'vitest';
import { parseYouTubeVideoId } from './youtube';

describe('parseYouTubeVideoId', () => {
  it('accepts trusted watch, short and embed URLs', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=abcDEF_1234')).toBe('abcDEF_1234');
    expect(parseYouTubeVideoId('https://youtu.be/abcDEF_1234')).toBe('abcDEF_1234');
    expect(parseYouTubeVideoId('https://youtube.com/embed/abcDEF_1234')).toBe('abcDEF_1234');
  });

  it('rejects lookalike hosts, unsupported paths and ordinary links', () => {
    expect(parseYouTubeVideoId('https://youtube.com.evil.test/watch?v=abcDEF_1234')).toBeNull();
    expect(parseYouTubeVideoId('https://youtube.com/shorts/abcDEF_1234')).toBeNull();
    expect(parseYouTubeVideoId('https://example.com/video')).toBeNull();
  });
});
