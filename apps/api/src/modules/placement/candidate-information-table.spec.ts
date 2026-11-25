import { candidateStimulusText } from './candidate-information-table';
import { pilotTaskPolicy } from './pilot-task-policy';

describe('server candidate boundaries', () => {
  it('rejects unsupported typed JSON instead of forwarding future private data', () => {
    expect(() => candidateStimulusText('{"kind":"future-stimulus","rubric":"PRIVATE"}')).toThrow();
    expect(() =>
      candidateStimulusText('{"kind":"assessment-table","version":2,"expectedFacts":"PRIVATE"}'),
    ).toThrow();
    expect(candidateStimulusText('A plain legacy passage.')).toBe('A plain legacy passage.');
  });
  const sheet = {
    kind: 'assessment-table',
    version: 1,
    caption: 'Synthetic timetable',
    columns: ['Time', 'Activity'],
    rows: [['08:00', 'Example']],
  };
  it('serializes ONLY the five allowed fields before network delivery', () => {
    const result = candidateStimulusText(
      JSON.stringify({
        ...sheet,
        expectedFacts: 'PRIVATE_EXPECTED',
        rubric: 'PRIVATE_RUBRIC',
        sourceBrief: 'PRIVATE_BRIEF',
        internalKey: 'PRIVATE_KEY',
      }),
    );
    expect(JSON.parse(result!)).toEqual(sheet);
    expect(result).not.toContain('PRIVATE');
    const escaped = JSON.stringify({ ...sheet, expectedFacts: 'PRIVATE_FACTS' }).replace(
      'assessment-table',
      'assessment\\u002dtable',
    );
    expect(candidateStimulusText(escaped)).not.toContain('PRIVATE');
  });
  it('rejects malformed tables without dumping private data; preserves legacy plain text', () => {
    expect(() =>
      candidateStimulusText(JSON.stringify({ ...sheet, rows: [[{ expectedFacts: 'PRIVATE' }]] })),
    ).toThrow();
    expect(() =>
      candidateStimulusText('{"kind":"assessment-table","expectedFacts":"PRIVATE"'),
    ).toThrow();
    expect(candidateStimulusText('Ordinary synthetic text')).toBe('Ordinary synthetic text');
  });
  it('scopes the fixed replay contract and blocks the explicitly retired content version', () => {
    expect(pilotTaskPolicy('SE_SW_01_S10_V01')).toEqual({
      kind: 'DOUBLE_PROMPT_THEN_RECORD',
      version: 1,
      plays: 2,
      responseSeconds: 30,
    });
    expect(pilotTaskPolicy('PROVIDED_INFORMATION')).toBeNull();
    expect(pilotTaskPolicy('SE_SW_01_W5_V02')).toBeNull();
    expect(() => pilotTaskPolicy('SE_SW_01_W5_V01')).toThrow();
  });
});
