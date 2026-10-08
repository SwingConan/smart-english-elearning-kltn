import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillTrendChart, type SkillTrendPoint } from './SkillTrendChart';
import { formatTrendNumber } from './trend-format';

const point = (id: string, title: string, date: string, score?: number): SkillTrendPoint => ({
  id,
  title,
  date,
  values: score === undefined ? {} : { LISTENING: { score, sampleCount: 3 } },
});

afterEach(cleanup);

describe('SkillTrendChart', () => {
  it('uses non-overlapping slope rows for exactly two assessments and exposes deltas', () => {
    const points: SkillTrendPoint[] = [
      { id: 'periodic', title: 'Kiểm tra thường kỳ', date: '2026-09-01T00:00:00Z', values: {
        LISTENING: { score: 4, sampleCount: 3 }, READING: { score: 6.2, sampleCount: 2 },
        SPEAKING: { score: 3.1, sampleCount: 1 },
      } },
      { id: 'midterm', title: 'Kiểm tra giữa kỳ', date: '2026-10-01T00:00:00Z', values: {
        LISTENING: { score: 8.200000000000003, sampleCount: 4 }, READING: { score: 4.2, sampleCount: 3 },
        SPEAKING: { score: 3.1000000000000085, sampleCount: 2 }, WRITING: { score: 9, sampleCount: 1 },
      } },
    ];
    render(<SkillTrendChart showSampleCount points={points} />);
    expect(screen.getByTestId('two-point-skill-slope')).toBeInTheDocument();
    expect(screen.getAllByTestId(/trend-row-/)).toHaveLength(4);
    expect(screen.getByText('+4.2 điểm')).toBeInTheDocument();
    expect(screen.getByText('-2 điểm')).toBeInTheDocument();
    expect(screen.getByText('0 điểm')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('n=3').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/000000000000/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Kiểm tra thường kỳ');
  });

  it('formats integer and floating-tail values deterministically', () => {
    expect(formatTrendNumber(4)).toBe('4');
    expect(formatTrendNumber(4.0)).toBe('4');
    expect(formatTrendNumber(4.200000000000003)).toBe('4.2');
    expect(formatTrendNumber(3.1000000000000085)).toBe('3.1');
  });

  it('uses the restrained line fallback for three points and never invents missing zeroes', () => {
    render(<SkillTrendChart points={[
      point('one', 'Đợt 1', '2026-08-01T00:00:00Z', 60),
      point('two', 'Đợt 2', '2026-09-01T00:00:00Z'),
      point('three', 'Đợt 3', '2026-10-01T00:00:00Z', 80),
    ]} />);
    expect(screen.getByRole('img', { name: /Biểu đồ xu hướng kỹ năng/i })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Chưa có dữ liệu');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
