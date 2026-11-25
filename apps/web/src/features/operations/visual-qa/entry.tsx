import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '@/components/ui/Feedback';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { PublicLayout } from '@/layouts/PublicLayout';
import { OperationsPage } from '../OperationsPage';
import { fixtureDate, fixtureScope, readerFor, scenarios, watermark } from './fixtures';

declare const __W10_QA_ONLY__: boolean;
if (
  typeof __W10_QA_ONLY__ === 'undefined' ||
  !__W10_QA_ONLY__ ||
  location.origin !== 'http://127.0.0.1:55831' ||
  document.documentElement.dataset.w10Qa !== 'S5B'
)
  throw Error('W10_QA_ISOLATION_REQUIRED');
const scenario = scenarios.find(
  (s) => s.id === new URLSearchParams(location.search).get('scenario'),
);
if (!scenario) throw Error('UNKNOWN_SYNTHETIC_SCENARIO');
const auth: AuthContextValue = {
  user: {
    id: 'synthetic-viewer',
    email: 'visual-qa@example.invalid',
    fullName: 'Synthetic QA Actor',
    role: scenario.role,
    status: 'ACTIVE',
  },
  isLoading: false,
  error: null,
  login: async () => {
    throw Error('QA_LOGIN_DISABLED');
  },
  register: async () => {
    throw Error('QA_REGISTER_DISABLED');
  },
  logout: async () => {
    throw Error('QA_LOGOUT_DISABLED');
  },
  refreshUser: async () => {
    throw Error('QA_REFRESH_DISABLED');
  },
};
const path = `/workspace/operations/${scenario.section}?date=${fixtureDate}&scope=${fixtureScope(scenario.role)}`;
createRoot(document.getElementById('qa-root')!).render(
  <AuthContext.Provider value={auth}>
    <ToastProvider>
      <div
        data-qa-watermark="true"
        style={{
          position: 'fixed',
          inset: '0 0 auto',
          zIndex: 100,
          minHeight: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#312e81',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.04em',
          padding: '8px 12px',
          textAlign: 'center',
        }}
      >
        {watermark}
      </div>
      <div style={{ paddingTop: 36 }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route
                path="/workspace/operations/:section"
                element={<OperationsPage reader={readerFor(scenario)} />}
              />
              <Route path="*" element={<p>QA route only — no operational page available.</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </div>
      <aside
        data-qa-fixture="true"
        className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-600"
        aria-label="Fixture provenance"
      >
        Fixture: {scenario.id} · Role: {scenario.role} · {scenario.state} · deterministic{' '}
        {fixtureDate}.{' '}
        {scenario.state === 'zero'
          ? 'Declared fixture zero is intentionally UNVERIFIED/— in real W10 because runtime evidence is absent.'
          : 'No operational metric or actual authorization.'}
      </aside>
    </ToastProvider>
  </AuthContext.Provider>,
);
document.documentElement.dataset.qaMounted = scenario.id;
