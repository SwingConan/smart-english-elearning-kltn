import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the project title', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Smart English E-Learning').length).toBeGreaterThan(0);
  });
});
