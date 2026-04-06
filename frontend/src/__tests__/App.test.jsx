import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../App';

// Stub page components so the test has no external API dependencies
jest.mock('../pages/Dashboard', () => () => <div>Dashboard</div>);
jest.mock('../pages/PromptList', () => () => <div>PromptList</div>);
jest.mock('../pages/PromptEditor', () => () => <div>PromptEditor</div>);
jest.mock('../pages/PromptDetail', () => () => <div>PromptDetail</div>);
jest.mock('../pages/TagsManagement', () => () => <div>TagsManagement</div>);
jest.mock('../pages/AgentsManagement', () => () => <div>AgentsManagement</div>);

function renderAppLayout(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppLayout />
    </MemoryRouter>
  );
}

describe('AppLayout sidebar', () => {
  it('renders a Prompt Manager link that navigates to the homepage (/)', () => {
    renderAppLayout();
    const homeLink = screen.getByRole('link', { name: /prompt manager/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('renders navigation links for Dashboard, Prompts, Tags and Agents', () => {
    renderAppLayout();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /prompts/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tags/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /agents/i })).toBeInTheDocument();
  });
});
