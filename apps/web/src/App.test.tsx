import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthContext';
import { authApi } from './features/auth/api';
import { ApiError } from './lib/api-client';

describe('App', () => {
  it('renders the project title', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Smart English E-Learning').length).toBeGreaterThan(0);
    expect(await screen.findByText('Đăng nhập')).toBeInTheDocument();
  });
});
