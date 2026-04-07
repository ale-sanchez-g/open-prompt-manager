import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import * as apiService from '../services/api';

jest.mock('../services/api');

function renderLandingPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiService.healthApi = {
      check: jest.fn().mockResolvedValue({ data: { version: '1.0.0' } }),
    };
  });

  it('renders the app title', async () => {
    renderLandingPage();
    await waitFor(() => {
      expect(screen.getAllByText('Prompt Manager')[0]).toBeInTheDocument();
    });
  });

  it('renders the hero heading', () => {
    renderLandingPage();
    expect(screen.getByText('Manage Your AI Prompts with Confidence')).toBeInTheDocument();
  });

  it('renders Get Started link pointing to /dashboard', () => {
    renderLandingPage();
    const link = screen.getByRole('link', { name: /get started/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders Go to Dashboard link pointing to /dashboard', () => {
    renderLandingPage();
    const link = screen.getByRole('link', { name: /go to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders the features section', () => {
    renderLandingPage();
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Prompt Management')).toBeInTheDocument();
    expect(screen.getByText('Version Control')).toBeInTheDocument();
    expect(screen.getByText('Agent Management')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('Composable Prompts')).toBeInTheDocument();
    expect(screen.getByText('Quality Metrics')).toBeInTheDocument();
  });

  it('renders the how it works section', () => {
    renderLandingPage();
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Create Prompts')).toBeInTheDocument();
    expect(screen.getByText('Organize & Tag')).toBeInTheDocument();
    expect(screen.getByText('Render & Execute')).toBeInTheDocument();
    expect(screen.getByText('Monitor Quality')).toBeInTheDocument();
  });

  it('renders Open Dashboard link pointing to /dashboard', () => {
    renderLandingPage();
    const link = screen.getByRole('link', { name: /open dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('fetches and displays the app version from the health endpoint', async () => {
    renderLandingPage();
    await waitFor(() => {
      expect(apiService.healthApi.check).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });
  });

  it('displays "Unknown" when version fetch fails', async () => {
    apiService.healthApi.check = jest.fn().mockRejectedValue(new Error('API error'));
    renderLandingPage();
    await waitFor(() => {
      expect(screen.getByText('vUnknown')).toBeInTheDocument();
    });
  });

  it('renders the step numbers', () => {
    renderLandingPage();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
