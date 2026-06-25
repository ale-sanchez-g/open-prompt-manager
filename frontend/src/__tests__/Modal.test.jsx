import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../components/Modal';

describe('Modal', () => {
  it('renders title and children', () => {
    render(<Modal onClose={() => {}} title={<span>My Title</span>}>Body content</Modal>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('is exposed as an accessible dialog', () => {
    render(<Modal onClose={() => {}} ariaLabel="Version diff">x</Modal>);
    expect(screen.getByRole('dialog', { name: 'Version diff' })).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}>x</Modal>);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}>x</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('applies the maxWidth class to the panel', () => {
    render(<Modal onClose={() => {}} ariaLabel="d" maxWidth="max-w-4xl">x</Modal>);
    expect(screen.getByRole('dialog').className).toContain('max-w-4xl');
  });
});
