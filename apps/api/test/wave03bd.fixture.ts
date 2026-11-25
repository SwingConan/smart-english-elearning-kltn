import { randomUUID } from 'node:crypto';
import type { seedWave03A } from './wave03a.fixture';
type Fixture = Awaited<ReturnType<typeof seedWave03A>>;
export async function grantKnowledge(f: Fixture, userId: string, capability: string) {
  const request = f.agents.get(f.admin.id)!,
    checker = f.agents.get(f.approver.id)!,
    u = [...f.users, f.otherAcademic, ...f.contenders].find((x) => x.id === userId)!;
  if (!u.email.endsWith('@example.invalid')) throw Error('SYNTHETIC_ONLY');
  const row = (
    await request
      .post('/api/authority/grants')
      .send({
        userId,
        capability,
        scopeType: 'GLOBAL',
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        reason: 'Synthetic isolated knowledge capability test; not a real personnel grant',
      })
      .expect(201)
  ).body;
  await checker
    .post('/api/authority/grants/' + row.id + '/approve')
    .send({})
    .expect(201);
  await f.agents
    .get(userId)!
    .post('/api/auth/login')
    .send({ email: u.email, password: f.password })
    .expect(200);
  return row;
}
export const knowledgeKey = () => randomUUID();
export function tagDraft(code = 'WORD_FORMS') {
  return {
    idempotencyKey: randomUUID(),
    kind: 'TAG',
    slug: 'tag-' + code.toLowerCase().replaceAll('_', '-'),
    tagCode: code,
    title: code === 'WORD_FORMS' ? 'Word Forms' : code,
    expectedPreviousVersion: 0,
    expectedLockVersion: 0,
    objectives: [],
    bodyMarkdown: '',
    examples: [],
    practice: [],
    references: [],
    skills: ['READING'],
    part: 5,
    synonyms: ['word forms', 'word families'],
    tagRevisionIds: [],
  };
}
export function articleDraft(tagRevisionId: string, slug = 'word-forms') {
  return {
    idempotencyKey: randomUUID(),
    kind: 'ARTICLE',
    slug,
    title: 'Word Forms',
    expectedPreviousVersion: 0,
    expectedLockVersion: 0,
    objectives: ['Identify the missing word class', 'Use context before suffixes'],
    bodyMarkdown:
      '# Word Forms\n## Nouns, verbs, adjectives and adverbs\nIdentify the function of the gap before choosing a word. A noun can name an event or object; an adjective can describe a noun. Read the whole sentence before selecting a form. This synthetic content is independent of Quiz questions.',
    examples: [
      {
        english: 'The assistant checked the schedule carefully.',
        explanation: 'Carefully describes how the checking was done.',
      },
    ],
    practice: [
      {
        prompt: 'The new timetable is ___.',
        options: ['helpful', 'help', 'helpfully'],
        answer: 0,
        feedback: 'After is, an adjective can describe the timetable.',
      },
      {
        prompt: 'They replied ___.',
        options: ['promptly', 'prompt', 'promptness'],
        answer: 0,
        feedback: 'An adverb can describe replied.',
      },
      {
        prompt: 'We welcomed her ___.',
        options: ['suggestion', 'suggest', 'suggested'],
        answer: 0,
        feedback: 'The gap follows her and is the object of welcomed.',
      },
    ],
    rights: {
      kind: 'ORIGINAL',
      owner: 'Synthetic DEV author',
      license: 'ORIGINAL_TEXT',
      proof:
        'Original synthetic prose and standalone practice composed for isolated development tests; no protected exam material copied.',
    },
    references: [
      {
        title: 'Cambridge word classes — reference only',
        url: 'https://dictionary.cambridge.org/grammar/british-grammar/word-classes-and-phrase-classes',
      },
    ],
    skills: [],
    synonyms: [],
    tagRevisionIds: [tagRevisionId],
  };
}
