import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KnowledgeArticlePage,
  KnowledgeLibraryPage,
  KnowledgeRecommendations,
  KnowledgeEditorPage,
  KnowledgeWorkspacePage,
} from '@/pages/KnowledgeLibraryPage';
import { AuthorityPage } from '@/pages/AuthorityPage';
import { knowledgeReturnTo, type Article, type Workspace } from './api';
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mock.fetch(...args),
  apiUrl: (p: string) => '/api' + p,
}));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'synthetic-user', role: 'SYSTEM_ADMIN' } }),
}));
beforeEach(() => {
  mock.fetch.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const article: Article = {
  revisionId: '10000000-0000-4000-8000-000000000001',
  slug: 'word-forms',
  title: 'Word Forms',
  version: 1,
  objectives: ['Identify the missing word class'],
  bodyMarkdown:
    '## Nouns, verbs, adjectives and adverbs\nRead the full clause before choosing a form.',
  examples: [{ english: 'The outline seems clear.', explanation: 'Clear describes outline.' }],
  practice: [0, 1, 2].map((item) => ({
    item,
    prompt: 'Independent formative prompt ' + (item + 1),
    options: ['Option A', 'Option B'],
  })),
  references: [
    {
      title: 'Reference',
      url: 'https://dictionary.cambridge.org/grammar/british-grammar/word-classes-and-phrase-classes',
    },
  ],
  tags: [
    {
      revisionId: 't',
      entryId: 'te',
      code: 'WORD_FORMS',
      name: 'Word Forms',
      version: 1,
      skills: ['READING'],
      part: 5,
      synonyms: ['word families'],
    },
  ],
  publishedAt: '2026-11-01T00:00:00Z',
  attribution: 'Synthetic original author',
  selfCheckOnly: true,
};
const workspace: Workspace = {
  capabilities: { author: false, review: false, publish: false },
  entries: [],
  tags: [],
  links: [],
};
function reader() {
  return render(
    <MemoryRouter initialEntries={['/knowledge/articles/word-forms']}>
      <Routes>
        <Route path="/knowledge/articles/:slug" element={<KnowledgeArticlePage />} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('W03B-D real library learner/editor boundaries', () => {
  it('accepts a local learning return path and rejects open redirects, schemes and injected query context', () => {
    const path = '/classroom/10000000-0000-4000-8000-000000000001/gradebook';
    expect(knowledgeReturnTo(path)).toBe(path);
    for (const value of [
      '//evil.example',
      'javascript:alert(1)',
      '/classroom/id',
      '/knowledge?next=https://evil.example',
      path + '?learnerId=someone',
    ])
      expect(knowledgeReturnTo(value)).toBe('/knowledge');
  });
  it('browses data and submits skill/Part/tag/synonym search without an enrollment precondition', async () => {
    mock.fetch.mockResolvedValue({ data: [article], meta: { total: 1 }, tags: article.tags });
    render(
      <MemoryRouter>
        <KnowledgeLibraryPage />
      </MemoryRouter>,
    );
    await screen.findByRole('link', { name: 'Word Forms' });
    fireEvent.change(screen.getByLabelText('Tìm bài / từ đồng nghĩa'), {
      target: { value: 'word families' },
    });
    fireEvent.change(screen.getByLabelText('Kỹ năng'), { target: { value: 'READING' } });
    fireEvent.change(screen.getByLabelText('TOEIC Part'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Chủ điểm'), { target: { value: 'WORD_FORMS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiến thức' }));
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(2));
    expect(mock.fetch.mock.calls[1][0]).toContain(
      'search=word+families&skill=READING&part=5&tag=WORD_FORMS',
    );
  });
  it('renders3 self-checks, sends the current revision and clears old feedback when the choice changes', async () => {
    mock.fetch.mockImplementation(async (_p: string, b?: { body: string }) =>
      b
        ? {
            correct: true,
            feedback: 'The adjective describes the noun.',
            formativeOnly: true,
            gradeRecorded: false,
          }
        : article,
    );
    reader();
    await screen.findByRole('heading', { name: 'Word Forms', level: 1 });
    const first = screen.getByRole('group', { name: 'Tự kiểm tra 1' });
    expect(screen.getAllByRole('group', { name: /Tự kiểm tra \d/ })).toHaveLength(3);
    expect(within(first).getByRole('button', { name: 'Kiểm tra câu 1' })).toBeDisabled();
    fireEvent.click(within(first).getByRole('radio', { name: 'Option A' }));
    fireEvent.click(within(first).getByRole('button', { name: 'Kiểm tra câu 1' }));
    await screen.findByText('The adjective describes the noun.');
    expect(JSON.parse(mock.fetch.mock.calls[1][1].body)).toEqual({
      revisionId: article.revisionId,
      item: 0,
      option: 0,
    });
    fireEvent.click(within(first).getByRole('radio', { name: 'Option B' }));
    expect(screen.queryByText('The adjective describes the noun.')).not.toBeInTheDocument();
    expect(screen.queryByText(/0%|TOEIC 990|0\/3/)).not.toBeInTheDocument();
  });
  it('withdrawal/reload failure clears the former article and its practice', async () => {
    mock.fetch.mockResolvedValueOnce(article).mockRejectedValueOnce(Error('404 withdrawn'));
    reader();
    await screen.findByRole('heading', { name: 'Word Forms', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bài kiến thức' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('The outline seems clear.')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tự kiểm tra 1' })).not.toBeInTheDocument();
  });
  it('renders untrusted markup as inert text and references as explicit no-referrer links only', async () => {
    mock.fetch.mockResolvedValue({
      ...article,
      bodyMarkdown: '<script>window.leaked=true</script>\n![pixel](https://tracking.example/p)',
    });
    reader();
    await screen.findByRole('heading', { name: 'Word Forms', level: 1 });
    expect(document.querySelector('script,img,iframe')).toBeNull();
    expect(screen.getByRole('link', { name: 'Reference ↗' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByText('<script>window.leaked=true</script>')).toBeInTheDocument();
  });
  it('insufficient evidence has no fabricated0 or percentage and still permits normal browse', async () => {
    mock.fetch.mockResolvedValue({
      state: 'INSUFFICIENT_DATA',
      message: 'Chưa đủ dữ liệu',
      recommendations: [],
    });
    render(
      <MemoryRouter>
        <KnowledgeRecommendations returnTo="/knowledge" />
      </MemoryRouter>,
    );
    await screen.findByText('Chưa đủ dữ liệu');
    expect(screen.queryByText(/0\/4|0%|mastery/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Duyệt thư viện kiến thức' })).toHaveAttribute(
      'href',
      '/knowledge',
    );
  });
  it('shows only a grounded1/4 aggregate and approved article link with safe return context', async () => {
    const back = '/classroom/10000000-0000-4000-8000-000000000001/gradebook';
    mock.fetch.mockResolvedValue({
      state: 'AVAILABLE',
      message: 'Published evidence',
      recommendations: [
        {
          tag: 'Word Forms',
          code: 'WORD_FORMS',
          correct: 1,
          total: 4,
          message: 'Word Forms: 1/4 câu đúng — nên ôn kiến thức này',
          article: { slug: 'word-forms', title: 'Word Forms', version: 1, revisionId: 'a' },
          source: 'PUBLISHED_QUIZ_AGGREGATE',
          notProficiency: true,
        },
      ],
    });
    render(
      <MemoryRouter>
        <KnowledgeRecommendations returnTo={back} />
      </MemoryRouter>,
    );
    await screen.findByText('Word Forms: 1/4 câu đúng — nên ôn kiến thức này');
    expect(screen.getByRole('link', { name: 'Word Forms · phiên bản 1' })).toHaveAttribute(
      'href',
      '/knowledge/articles/word-forms?returnTo=' + encodeURIComponent(back),
    );
    expect(screen.queryByText(/Question 1|isCorrect|explanation/)).not.toBeInTheDocument();
  });
  it('without a knowledge grant there are no create/review/publication controls', async () => {
    mock.fetch.mockResolvedValue(workspace);
    render(
      <MemoryRouter>
        <KnowledgeWorkspacePage />
      </MemoryRouter>,
    );
    await screen.findByText(/Bạn chưa được cấp quyền biên soạn hoặc duyệt bài/);
    expect(
      screen.queryByRole('link', { name: 'Tạo bài hoặc nhãn kiến thức' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Công bố phiên bản kiến thức' }),
    ).not.toBeInTheDocument();
  });
  it('failed draft save keeps entered content and never marks it reviewed/published', async () => {
    mock.fetch.mockImplementation(async (_p: string, b?: { body: string }) => {
      if (b) throw Error('403');
      return { ...workspace, capabilities: { author: true, review: false, publish: false } };
    });
    render(
      <MemoryRouter>
        <KnowledgeEditorPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Slug ổn định'), { target: { value: 'word-forms' } });
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'My retained draft' } });
    fireEvent.change(screen.getByLabelText('Nội dung bài (Markdown an toàn)'), {
      target: { value: 'Original draft body retained on failure' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp kiến thức' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Nội dung bài (Markdown an toàn)')).toHaveValue(
      'Original draft body retained on failure',
    );
    expect(screen.queryByText('Đã công bố phiên bản')).not.toBeInTheDocument();
  });
  it('all3 knowledge capabilities use an explicit center GLOBAL scope; selecting them grants nothing', async () => {
    mock.fetch.mockImplementation(async (p: string) =>
      p === '/workspace'
        ? { capabilities: { authorityApprove: false } }
        : p === '/authority'
          ? { grants: [], roles: [], audit: [] }
          : { data: [] },
    );
    render(
      <MemoryRouter>
        <AuthorityPage />
      </MemoryRouter>,
    );
    for (const cap of ['knowledge.author', 'knowledge.review', 'knowledge.publish']) {
      fireEvent.change(screen.getByLabelText('Quyền bổ sung'), { target: { value: cap } });
      expect(screen.getByLabelText('Phạm vi quyền')).toHaveValue('GLOBAL');
      expect(screen.queryByLabelText('Mã định danh lớp')).not.toBeInTheDocument();
    }
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(3));
    expect(mock.fetch.mock.calls.every((x) => x.length === 1)).toBe(true);
  });
});
