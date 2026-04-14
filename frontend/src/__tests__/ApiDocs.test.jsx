import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiDocs from '../pages/ApiDocs';

function renderApiDocs() {
  return render(
    <MemoryRouter>
      <ApiDocs />
    </MemoryRouter>
  );
}

describe('ApiDocs page', () => {
  it('renders the page heading', () => {
    renderApiDocs();
    expect(screen.getByText('API Documentation')).toBeInTheDocument();
  });

  it('renders the sub-heading', () => {
    renderApiDocs();
    expect(screen.getByText('Schemas, endpoints, and integration guides')).toBeInTheDocument();
  });

  // ── Section headings ────────────────────────────────────────────────────────

  it('renders the Overview section', () => {
    renderApiDocs();
    expect(screen.getByRole('heading', { name: /overview/i })).toBeInTheDocument();
  });

  it('renders the Schemas section', () => {
    renderApiDocs();
    expect(screen.getByRole('heading', { name: /schemas/i })).toBeInTheDocument();
  });

  it('renders the User Journeys section', () => {
    renderApiDocs();
    expect(screen.getByRole('heading', { name: /user journeys/i })).toBeInTheDocument();
  });

  it('renders the Prompts API section', () => {
    renderApiDocs();
    expect(screen.getByRole('heading', { name: /prompts api/i })).toBeInTheDocument();
  });

  it('renders the Tags API section', () => {
    renderApiDocs();
    expect(screen.getByRole('heading', { name: /tags api/i })).toBeInTheDocument();
  });

  it('renders the Agents API section', () => {
    renderApiDocs();
    expect(screen.getByRole('heading', { name: /agents api/i })).toBeInTheDocument();
  });

  it('renders the Health API section', () => {
    renderApiDocs();
    expect(screen.getByRole('heading', { name: /health api/i })).toBeInTheDocument();
  });

  // ── Schema tables ───────────────────────────────────────────────────────────

  it('renders the Prompt schema sub-section', () => {
    renderApiDocs();
    const headings = screen.getAllByRole('heading', { name: /prompt/i });
    expect(headings.length).toBeGreaterThan(0);
  });

  it('renders the Variable schema sub-section', () => {
    renderApiDocs();
    // "Variable" text should appear at least once
    expect(screen.getAllByText(/variable/i).length).toBeGreaterThan(0);
  });

  it('shows the content field in the Prompt schema', () => {
    renderApiDocs();
    const cells = screen.getAllByText('content');
    expect(cells.length).toBeGreaterThan(0);
  });

  // ── Sidebar navigation links ────────────────────────────────────────────────

  it('renders the Swagger UI link', () => {
    renderApiDocs();
    const links = screen.getAllByRole('link', { name: /swagger ui/i });
    const swaggerLink = links.find((l) => l.getAttribute('href') === '/api/docs');
    expect(swaggerLink).toBeTruthy();
  });

  it('renders the ReDoc link', () => {
    renderApiDocs();
    const links = screen.getAllByRole('link', { name: /redoc/i });
    const redocLink = links.find((l) => l.getAttribute('href') === '/api/redoc');
    expect(redocLink).toBeTruthy();
  });

  // ── Endpoint accordion ──────────────────────────────────────────────────────

  it('shows endpoint method badges', () => {
    renderApiDocs();
    // Multiple GET/POST/PUT/DELETE badges should be present
    const getBadges = screen.getAllByText('GET');
    expect(getBadges.length).toBeGreaterThan(0);
    const postBadges = screen.getAllByText('POST');
    expect(postBadges.length).toBeGreaterThan(0);
  });

  it('expands an endpoint accordion on click to show the description', () => {
    renderApiDocs();
    // Use the unique render path which only appears once
    const renderPathEl = screen.getByText('/api/prompts/{prompt_id}/render');
    fireEvent.click(renderPathEl.closest('button'));
    expect(screen.getByText(/substitutes variables and resolves component references/i)).toBeInTheDocument();
  });

  it('collapses an expanded endpoint accordion on second click', () => {
    renderApiDocs();
    const renderPathEl = screen.getByText('/api/prompts/{prompt_id}/render');
    const btn = renderPathEl.closest('button');
    fireEvent.click(btn);
    // Verify it opened
    expect(screen.getByText(/substitutes variables and resolves component references/i)).toBeInTheDocument();
    // Click again to close
    fireEvent.click(btn);
    expect(screen.queryByText(/substitutes variables and resolves component references/i)).not.toBeInTheDocument();
  });

  // ── User journeys ───────────────────────────────────────────────────────────

  it('renders the "Create and render a prompt" journey', () => {
    renderApiDocs();
    expect(screen.getByText(/create and render a prompt/i)).toBeInTheDocument();
  });

  it('renders the "Version a prompt" journey', () => {
    renderApiDocs();
    expect(screen.getByText(/version a prompt/i)).toBeInTheDocument();
  });

  it('renders the "Register an agent and track executions" journey', () => {
    renderApiDocs();
    expect(screen.getByText(/register an agent and track executions/i)).toBeInTheDocument();
  });

  it('renders the "Build a composable prompt" journey', () => {
    renderApiDocs();
    expect(screen.getByText(/build a composable prompt/i)).toBeInTheDocument();
  });

  // ── Key concepts ────────────────────────────────────────────────────────────

  it('explains variable substitution syntax', () => {
    renderApiDocs();
    expect(screen.getAllByText(/variable substitution/i).length).toBeGreaterThan(0);
  });

  it('explains component embedding syntax', () => {
    renderApiDocs();
    expect(screen.getAllByText(/component embedding/i).length).toBeGreaterThan(0);
  });

  // ── Error codes ─────────────────────────────────────────────────────────────

  it('documents the 404 error code', () => {
    renderApiDocs();
    expect(screen.getAllByText('404').length).toBeGreaterThan(0);
  });

  it('documents the 409 error code', () => {
    renderApiDocs();
    expect(screen.getAllByText('409').length).toBeGreaterThan(0);
  });

  it('documents the 422 error code', () => {
    renderApiDocs();
    expect(screen.getAllByText('422').length).toBeGreaterThan(0);
  });
});
