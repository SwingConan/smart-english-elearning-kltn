import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { KnowledgeDraftDto } from './knowledge.dto';
import { knowledgeReference, knowledgeText, validateKnowledge } from './knowledge.policy';
const tag = () =>
  plainToInstance(KnowledgeDraftDto, {
    kind: 'TAG',
    slug: 'word-forms-tag',
    tagCode: 'WORD_FORMS',
    title: 'Word Forms',
    skills: ['READING'],
    part: 5,
    objectives: [],
    examples: [],
    practice: [],
    references: [],
    synonyms: [],
    tagRevisionIds: [],
  });
describe('W03B-D knowledge content/source boundaries', () => {
  it.each([
    '<script>alert(1)</script>',
    '<iframe src="https://x.test"></iframe>',
    '![pixel](https://x.test/p)',
    'javascript:alert(1)',
    'data:text/html,secret',
    'https://x.test/pixel',
  ])('rejects active/embed/tracking text %s', (s) => expect(() => knowledgeText(s)).toThrow());
  it.each([
    'javascript:alert(1)',
    'http://example.org/reference',
    'https://127.0.0.1/p',
    'https://user:secret@example.org/p',
    'https://example.org/p?utm_source=x',
    'https://example.org/p#tracking',
    'https://internal/p',
  ])('rejects unsafe citation %s', (s) => expect(() => knowledgeReference(s)).toThrow());
  it('accepts an explicit passive public HTTPS reference without fetching it', () =>
    expect(
      knowledgeReference(
        'https://dictionary.cambridge.org/grammar/british-grammar/word-classes-and-phrase-classes',
      ),
    ).toContain('https://dictionary.cambridge.org/'));
  it('does not force reviewed tag semantics onto a legacy Skill or arbitrary TOEIC Part', () => {
    expect(() => validateKnowledge(tag(), true)).not.toThrow();
    expect(() => validateKnowledge({ ...tag(), part: 1 }, true)).toThrow();
    expect(() => validateKnowledge({ ...tag(), skills: ['LISTENING'], part: 5 }, true)).toThrow();
  });
  it('allows an unfinished draft while preventing publication of incomplete or duplicated practice', () => {
    const b = {
      ...tag(),
      kind: 'ARTICLE' as const,
      tagCode: undefined,
      bodyMarkdown: 'Draft',
      skills: [],
      part: undefined,
      practice: [{ prompt: '', options: ['', ''], answer: 0, feedback: '' }],
    };
    expect(() => validateKnowledge(b)).not.toThrow();
    expect(() => validateKnowledge(b, true)).toThrow();
  });
});
