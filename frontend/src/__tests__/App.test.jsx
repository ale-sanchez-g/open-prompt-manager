import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../App';
import * as apiService from '../services/api';

// Stub page components so the test has no external API dependencies
jest.mock('../pages/Dashboard', () => () => <div>Dashboard</div>);
jest.mock('../pages/PromptList', () => () => <div>PromptList</div>);
jest.mock('../pages/PromptEditor', () => () => <div>PromptEditor</div>);
jest.mock('../pages/PromptDetail', () => () => <div>PromptDetail</div>);
jest.mock('../pages/TagsManagement', () => () => <div>TagsManagement</div>);
jest.mock('../pages/AgentsManagement', () => () => <div>AgentsManagement</div>);
jest.mock('../pages/AgentDetail', () => () => <div>AgentDetail</div>);
jest.mock('../pages/ApiDocs', () => () => <div>ApiDocs</div>);
jest.mock('../services/api');

function renderAppLayout(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppLayout />
    </MemoryRouter>
  );
}

describe('AppLayout sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiService.healthApi = {
      check: jest.fn().mockResolvedValue({ data: { version: '1.0.0' } }),
    };
  });

  it('renders a Prompt Manager link that navigates to the homepage (/)', async () => {
    renderAppLayout();
    await waitFor(() => {
      const homeLink = screen.getByRole('link', { name: /prompt manager/i });
      expect(homeLink).toBeInTheDocument();
      expect(homeLink).toHaveAttribute('href', '/');
    });
  });

  it('renders navigation links for Dashboard, Prompts, Tags, Agents and API Docs', async () => {
    renderAppLayout();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /prompts/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /tags/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /agents/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /api docs/i })).toBeInTheDocument();
    });
  });

  it('fetches and displays the app version from the health endpoint', async () => {
    renderAppLayout();
    await waitFor(() => {
      expect(apiService.healthApi.check).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });
  });

  it('displays "Unknown" when version fetch fails', async () => {
    apiService.healthApi.check = jest.fn().mockRejectedValue(new Error('API error'));
    renderAppLayout();
    await waitFor(() => {
      expect(screen.getByText('vUnknown')).toBeInTheDocument();
    });
  });
});
