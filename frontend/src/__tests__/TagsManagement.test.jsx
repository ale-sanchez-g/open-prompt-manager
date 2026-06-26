import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TagsManagement from '../pages/TagsManagement';
import { tagsApi } from '../services/api';

jest.mock('../services/api');

const mockTags = [
  { id: 1, name: 'production', color: '#10B981' },
  { id: 2, name: 'beta',       color: '#F59E0B' },
];

beforeEach(() => {
  tagsApi.list.mockResolvedValue({ data: mockTags });
  tagsApi.create.mockResolvedValue({ data: { id: 3, name: 'new-tag', color: '#3B82F6' } });
  tagsApi.delete.mockResolvedValue({});
});

afterEach(() => {
  jest.clearAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><TagsManagement /></MemoryRouter>);
}

describe('TagsManagement', () => {
  it('renders page heading', async () => {
    renderPage();
    expect(await screen.findByText('Tags')).toBeInTheDocument();
  });

  it('lists existing tags', async () => {
    renderPage();
    expect(await screen.findByText('production')).toBeInTheDocument();
    expect(await screen.findByText('beta')).toBeInTheDocument();
  });

  it('shows tag count', async () => {
    renderPage();
    expect(await screen.findByText('All Tags (2)')).toBeInTheDocument();
  });

  it('submits create tag form', async () => {
    tagsApi.list
      .mockResolvedValueOnce({ data: mockTags })
      .mockResolvedValueOnce({ data: [...mockTags, { id: 3, name: 'new-tag', color: '#3B82F6' }] });

    renderPage();
    await screen.findByText('production');

    // The Name input is the only visible textbox in the create form
    const nameInput = screen.getByRole('textbox');
    fireEvent.change(nameInput, { target: { value: 'new-tag' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(tagsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'new-tag' })
      );
    });
  });

  it('calls delete after inline confirmation when trash button clicked', async () => {
    renderPage();
    await screen.findByText('production');

    // Open the inline confirmation for the "beta" tag (id 2), then confirm.
    fireEvent.click(screen.getByTestId('delete-tag-2'));
    fireEvent.click(screen.getByTestId('delete-tag-2-confirm'));

    await waitFor(() => {
      expect(tagsApi.delete).toHaveBeenCalledWith(2);
    });
  });

  it('does not delete when the inline confirmation is cancelled', async () => {
    renderPage();
    await screen.findByText('production');

    fireEvent.click(screen.getByTestId('delete-tag-2'));
    fireEvent.click(screen.getByTestId('delete-tag-2-cancel'));

    expect(tagsApi.delete).not.toHaveBeenCalled();
  });
});
