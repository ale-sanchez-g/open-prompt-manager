import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import { promptsApi, tagsApi, agentsApi } from '../services/api';
import { useFeatureFlag } from '../featureFlags/FeatureFlagProvider';

jest.mock('../services/api');
jest.mock('../featureFlags/FeatureFlagProvider', () => ({
  useFeatureFlag: jest.fn(),
}));

const BANNER_TEXT = /this banner is controlled by a feature flag/i;

beforeEach(() => {
  promptsApi.list.mockResolvedValue({ data: [] });
  tagsApi.list.mockResolvedValue({ data: [] });
  agentsApi.list.mockResolvedValue({ data: [] });
});

afterEach(() => jest.clearAllMocks());

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe('Dashboard welcome banner (dashboard_welcome_banner flag)', () => {
  it('shows the banner when the flag is enabled', async () => {
    useFeatureFlag.mockReturnValue(true);
    renderDashboard();
    await screen.findByText('Dashboard');
    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument();
  });

  it('hides the banner when the flag is disabled', async () => {
    useFeatureFlag.mockReturnValue(false);
    renderDashboard();
    await screen.findByText('Dashboard');
    await waitFor(() => {
      expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
    });
  });
});
