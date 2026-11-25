import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePlacementPdfPassages } from './placement-pdf-passages';
import { PlacementPdfPassagePane } from './PlacementPdfPassagePane';

afterEach(() => {
  cleanup();
});

describe('resolvePlacementPdfPassages & PlacementPdfPassagePane', () => {
  it('matches Test 2 Part 6 and Part 7 OCR groups and returns crisp PDF crop URLs', () => {
    const p6 = resolvePlacementPdfPassages({
      skill: 'READING',
      taskCode: 'P6',
      title: 'Part 6 Text Completion (131-134)',
      stimuli: [
        {
          type: 'TEXT',
          textContent:
            "Questions 131-134 refer to the following advertisement.\n\nWith Global Strength Gym's 30-day trial period...",
        },
      ],
    });
    expect(p6).toEqual({
      instruction: 'Questions 131-134 refer to the following advertisement.',
      imageUrls: ['/api/v2/practice-tests/media/test-2/images/p6_q131-134_p5_1.webp'],
    });

    const p7Triple = resolvePlacementPdfPassages({
      skill: 'READING',
      taskCode: 'P7',
      title: 'Part 7 Reading Comprehension (186-190)',
      stimuli: [
        {
          type: 'TEXT',
          textContent:
            'Questions 186-190 refer to the following e-mail, list, and article.\nFrom: mstoch@ hesidionclinic.com',
        },
      ],
    });
    expect(p7Triple?.imageUrls).toEqual([
      '/api/v2/practice-tests/media/test-2/images/p7_q186-190_p24_1.webp',
      '/api/v2/practice-tests/media/test-2/images/p7_q186-190_p24_2.webp',
      '/api/v2/practice-tests/media/test-2/images/p7_q186-190_p25_1.webp',
    ]);
  });

  it('ignores non-Test-2 or synthetic groups and Part 5 / Listening groups', () => {
    expect(
      resolvePlacementPdfPassages({
        skill: 'READING',
        taskCode: 'P5',
        title: 'Part 5 (101)',
        stimuli: [{ type: 'TEXT', textContent: 'Global Strength Gym 131-134' }],
      }),
    ).toBeNull();

    expect(
      resolvePlacementPdfPassages({
        skill: 'READING',
        taskCode: 'P7',
        title: 'Part 7 Synthetic Fixture (147-148)',
        stimuli: [{ type: 'TEXT', textContent: 'Questions 147-148 refer to Acme Bakery.' }],
      }),
    ).toBeNull();
  });

  it('renders stacked PDF passage images and opens zoom dialog on click', () => {
    const match = resolvePlacementPdfPassages({
      skill: 'READING',
      taskCode: 'P7',
      title: 'Part 7 Reading Comprehension (186-190)',
      stimuli: [
        {
          type: 'TEXT',
          textContent: 'Questions 186-190 ... hesidionclinic.com',
        },
      ],
    })!;

    render(<PlacementPdfPassagePane passage={match} fallbackText="OCR raw sample" />);

    expect(screen.getByText('Tài liệu 1 / 3')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu 3 / 3')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);

    fireEvent.click(screen.getAllByRole('button', { name: /Phóng to/i })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh phóng to' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
