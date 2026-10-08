import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillTrendChart, type SkillTrendPoint } from './SkillTrendChart';

const point = (id: string, title: string, date: string, score?: number): SkillTrendPoint => ({
  id,
  title,
  date,
  values: score === undefined ? {} : { LISTENING: { score, sampleCount: 3 } },
});

afterEach(cleanup);

describe('SkillTrendChart', () => {
  it('uses non-overlapping slope rows for exactly two assessments and exposes deltas', () => {
    render(<SkillTrendChart showSampleCount points={[
      point('periodic', 'Kiểm tra thường kỳ', '2026-09-01T00:00:00Z', 65),
      point('midterm', 'Kiểm tra giữa kỳ', '2026-10-01T00:00:00Z', 75),
    ]} />);
    expect(screen.getByTestId('two-point-skill-slope')).toBeInTheDocument();
    expect(screen.getByText('+10 điểm')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Kiểm tra thường kỳ');
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
