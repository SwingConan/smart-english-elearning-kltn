import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttemptStimuli } from '@/components/assessments/AttemptStimuli';
import { StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { renderAssessmentRoute } from './assessment-test-utils';
import { studentAssessmentApi } from './api';
import type { StudentAttemptContent, StudentAttemptStimulus } from './types';

const compoundReadingText =
  'WEB PAGE\nMountain and Forest Company\n\nOur shipping rates:\nOrder cost | Overnight | Standard\nUnder $25 | $8 | $3\nOver $100 | $18 | FREE\n\nE-MAIL\nTo: service@example.ca\nFrom: customer@example.ca\nDate: 10 January\nSubject: Order B75022\n\nPlease refund the shipping cost.';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Reading stimulus presentation', () => {
  it('renders structured document cards and a semantic table for an R7 text stimulus', () => {
    render(
      <AttemptStimuli
        stimuli={[textStimulus(compoundReadingText)]}
        stimulusText={null}
        skill="READING"
        taskCode="R7_READING_COMPREHENSION"
      />,
    );

    expect(screen.getByRole('article', { name: 'Trang web 1' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Email 2' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Over $100');
    expect(screen.getByText('Subject:').nextSibling).toHaveTextContent('Order B75022');
  });

  it('does not opt non-R6/R7 content into the structured renderer', () => {
    const { container } = render(
      <AttemptStimuli
        stimuli={[textStimulus(compoundReadingText)]}
        stimulusText={null}
        skill="LISTENING"
        taskCode="L4_TALK"
      />,
    );

    expect(container.querySelector('[data-reading-document-count]')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText(/WEB PAGE/)).toHaveTextContent('Order B75022');
  });

  it('keeps existing image and audio presentation available for non-Reading tasks', () => {
    render(
      <AttemptStimuli
        stimuli={[
          mediaStimulus('IMAGE', '/media/photo.jpg', 'Photograph stimulus'),
          mediaStimulus('AUDIO', '/media/talk.mp3', null),
        ]}
        stimulusText={null}
        skill="LISTENING"
        taskCode="L1_PHOTOGRAPH"
      />,
    );

    expect(screen.getByRole('img', { name: 'Photograph stimulus' })).toHaveAttribute(
      'src',
      '/media/photo.jpg',
    );
    expect(document.querySelector('audio')).toHaveAttribute('src', '/media/talk.mp3');
  });

  it.each([390, 820, 1440])(
    'keeps the learner Reading workspace present at a %ipx viewport without adding source-reference JPEGs',
    async (width) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(readingAttempt());

      renderAssessmentRoute(
        <StudentTestAttemptPage />,
        '/student/enrollments/e1/attempts/a1',
        '/student/enrollments/:enrollmentId/attempts/:attemptId',
      );

      const workspace = await screen.findByTestId('reading-workspace');
      expect(workspace).toHaveClass('grid', 'xl:grid-cols-[minmax(0,56fr)_minmax(24rem,44fr)]');
      expect(screen.getByTestId('reading-document-pane')).toHaveClass('xl:sticky');
      expect(screen.getByTestId('reading-question-pane')).toHaveTextContent('What is stated?');
      expect(workspace.querySelectorAll('[data-document-type]')).toHaveLength(2);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      await waitFor(() => expect(studentAssessmentApi.getAttempt).toHaveBeenCalledTimes(1));
    },
  );
});

function textStimulus(textContent: string): StudentAttemptStimulus {
  return {
    id: 'text-stimulus',
    type: 'TEXT',
    orderIndex: 0,
    textContent,
    mediaUrl: null,
    mimeType: null,
    altText: null,
  };
}

function mediaStimulus(
  type: 'IMAGE' | 'AUDIO',
  mediaUrl: string,
  altText: string | null,
): StudentAttemptStimulus {
  return {
    id: `${type.toLowerCase()}-stimulus`,
    type,
    orderIndex: 0,
    textContent: null,
    mediaUrl,
    mimeType: type === 'IMAGE' ? 'image/jpeg' : 'audio/mpeg',
    altText,
  };
}

function readingAttempt(): StudentAttemptContent {
  return {
    attempt: {
      id: 'a1',
      attemptNumber: 1,
      status: 'IN_PROGRESS',
      startedAt: '2026-10-19T00:00:00Z',
      submittedAt: null,
    },
    test: {
      id: 'practice-r7',
      title: 'Bài luyện sau bài học',
      type: 'QUIZ',
      purpose: 'PRACTICE_MOCK',
      stage: null,
      timeLimitMinutes: null,
    },
    groups: [
      {
        id: 'reading-group',
        skill: 'READING',
        orderIndex: 0,
        title: 'Reading comprehension',
        instructions: null,
        taskCode: 'R7_READING_COMPREHENSION',
        preparationSeconds: null,
        responseSeconds: null,
        recommendedSeconds: null,
        maxRecordingSeconds: null,
        stimulusText: null,
        stimuli: [textStimulus(compoundReadingText)],
        questions: [
          {
            testQuestionId: 'test-question-1',
            points: 1,
            selectedOptionIds: [],
            question: {
              id: 'question-1',
              type: 'SINGLE_CHOICE',
              responseType: 'SINGLE_CHOICE',
              toeicSkill: 'READING',
              difficulty: 'MEDIUM',
              content: 'What is stated?',
              options: [
                { id: 'option-a', content: 'Choice A', orderIndex: 0 },
                { id: 'option-b', content: 'Choice B', orderIndex: 1 },
              ],
            },
          },
        ],
      },
    ],
  };
}
