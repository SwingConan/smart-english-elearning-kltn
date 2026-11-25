import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

afterEach(cleanup);

it('delivers local authored audio and lesson/event links without allowing arbitrary embedded media', () => {
  const { container } = render(<SafeMarkdown markdown={'```audio\n/learning/toeic-foundation/unit-01.wav\n```\n- [Buổi định hướng](/my/events/83365de5-bfbe-4e3a-8045-608053b9d58f)\n[Bài học](/classroom/18653fb2-d42a-4aea-8313-a20e7f911daa/activities/8098391c-0df5-4de6-8ec8-d2864182c569)\n```audio\nhttps://untrusted.invalid/audio.wav\n```\n[Unsafe](javascript:alert(1))\n<script>alert(1)</script>'} />);
  expect(container.querySelectorAll('audio')).toHaveLength(1);
  expect(container.querySelector('audio')).toHaveAttribute('src', '/learning/toeic-foundation/unit-01.wav');
  expect(container.querySelector('audio')).toHaveAttribute('controls');
  expect(screen.getByRole('link', { name: 'Tải audio để tự luyện' })).toHaveAttribute('download');
  expect(screen.getByRole('link', { name: 'Buổi định hướng' })).toHaveAttribute('href', '/my/events/83365de5-bfbe-4e3a-8045-608053b9d58f');
  expect(screen.getByRole('link', { name: 'Bài học' })).toHaveAttribute('href', '/classroom/18653fb2-d42a-4aea-8313-a20e7f911daa/activities/8098391c-0df5-4de6-8ec8-d2864182c569');
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
});

it('renders inline formatting, GFM tables, horizontal rules, and task checkboxes safely', () => {
  const md = [
    '## Bài 01 · **Trọng tâm** `-s/-es` & *Ví dụ*',
    '',
    '---',
    '',
    '| Cụm từ | Phiên âm | Ví dụ |',
    '| :--- | :---: | ---: |',
    '| **lean against** | `/liːn əˈɡenst/` | *A man is leaning against the railing.* |',
    '',
    '- [ ] Tự luyện `Dictation` 20 phút',
    '- [x] Hoàn thành **nghe mẫu**',
  ].join('\n');
  const { container } = render(<SafeMarkdown markdown={md} />);
  expect(container.querySelector('table')).not.toBeNull();
  expect(container.querySelectorAll('th')).toHaveLength(3);
  expect(container.querySelectorAll('td')).toHaveLength(3);
  expect(container.querySelector('hr')).not.toBeNull();
  expect(container.querySelectorAll('strong').length).toBeGreaterThanOrEqual(3);
  expect(container.querySelectorAll('em').length).toBeGreaterThanOrEqual(2);
  expect(container.querySelectorAll('code').length).toBeGreaterThanOrEqual(3);
  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  expect(container.textContent).not.toContain('**lean against**');
  expect(container.textContent).not.toContain('| :--- |');
});
