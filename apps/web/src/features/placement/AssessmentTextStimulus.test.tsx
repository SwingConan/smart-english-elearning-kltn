import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssessmentTextStimulus } from './AssessmentTextStimulus';
import { parseInformationTable } from './information-table';

afterEach(cleanup);
const table = {
  kind: 'assessment-table',
  version: 1,
  caption: 'Synthetic schedule',
  columns: ['Time', 'Activity', 'Room', 'Host'],
  rows: [['08:00', 'Example event', 'X', 'Example host']],
};

describe('structured assessment information', () => {
  it('renders a native labelled table with row/column headers and a keyboard scroll region', () => {
    render(<AssessmentTextStimulus content={JSON.stringify(table)} />);
    const element = screen.getByRole('table', { name: table.caption });
    expect(within(element).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(element).getByRole('rowheader').textContent).toBe('08:00');
    expect(screen.getByRole('region', { name: table.caption }).getAttribute('tabindex')).toBe('0');
    expect(within(element).getByRole('cell', { name: 'Example host' })).toBeTruthy();
  });
  it('never renders rater-only fields or executes markup from a table cell', () => {
    render(
      <AssessmentTextStimulus
        content={JSON.stringify({
          ...table,
          sourceBrief: 'PRIVATE_BRIEF',
          correctFacts: 'PRIVATE_FACTS',
          rubric: 'PRIVATE_RUBRIC',
          rows: [['08:00', '<img src=x onerror=alert(1)>', 'X', 'Host']],
        })}
      />,
    );
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
  it('fails closed for malformed tables without dumping the envelope', () => {
    render(
      <AssessmentTextStimulus
        content={JSON.stringify({ ...table, rows: [['short']], correctFacts: 'PRIVATE_FACTS' })}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(document.body.textContent).not.toContain('PRIVATE_FACTS');
    expect(parseInformationTable(JSON.stringify({ ...table, rows: [[1, 2, 3, 4]] }))).toBeNull();
  });
  it('preserves existing ordinary text stimuli', () => {
    render(<AssessmentTextStimulus content="Ordinary synthetic passage" />);
    expect(screen.getByText('Ordinary synthetic passage')).toBeTruthy();
    expect(parseInformationTable(null)).toBeNull();
  });
});
