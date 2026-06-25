import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmButton from '../components/ConfirmButton';

function renderButton(props = {}) {
  const onConfirm = props.onConfirm || vi.fn().mockResolvedValue(undefined);
  render(
    <ConfirmButton
      onConfirm={onConfirm}
      idleLabel="Delete"
      promptLabel="Delete this item?"
      testId="confirm"
      {...props}
    />
  );
  return { onConfirm };
}

describe('ConfirmButton', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders only the idle trigger button initially', () => {
    renderButton();
    expect(screen.getByTestId('confirm')).toHaveTextContent('Delete');
    expect(screen.queryByTestId('confirm-confirm')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-cancel')).not.toBeInTheDocument();
  });

  it('reveals inline Confirm/Cancel controls on first click without confirming', () => {
    const { onConfirm } = renderButton();
    fireEvent.click(screen.getByTestId('confirm'));

    expect(screen.getByTestId('confirm-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-cancel')).toBeInTheDocument();
    expect(screen.getByText('Delete this item?')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not render a native dialog / window.confirm is never called', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderButton();
    fireEvent.click(screen.getByTestId('confirm'));
    fireEvent.click(screen.getByTestId('confirm-confirm'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('calls onConfirm when the Confirm button is clicked', async () => {
    const { onConfirm } = renderButton();
    fireEvent.click(screen.getByTestId('confirm'));
    fireEvent.click(screen.getByTestId('confirm-confirm'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('cancels and reverts to idle without calling onConfirm', () => {
    const { onConfirm } = renderButton();
    fireEvent.click(screen.getByTestId('confirm'));
    fireEvent.click(screen.getByTestId('confirm-cancel'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm')).toBeInTheDocument();
  });

  it('cancels when Escape is pressed', () => {
    const { onConfirm } = renderButton();
    fireEvent.click(screen.getByTestId('confirm'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-confirm')).not.toBeInTheDocument();
  });

  it('cancels when clicking outside the control', () => {
    const { onConfirm } = renderButton();
    fireEvent.click(screen.getByTestId('confirm'));
    fireEvent.mouseDown(document.body);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-confirm')).not.toBeInTheDocument();
  });

  it('shows the busy label while onConfirm is pending', async () => {
    let resolve;
    const onConfirm = vi.fn(() => new Promise((r) => { resolve = r; }));
    renderButton({ onConfirm, busyLabel: 'Deleting…' });

    fireEvent.click(screen.getByTestId('confirm'));
    fireEvent.click(screen.getByTestId('confirm-confirm'));

    expect(await screen.findByText('Deleting…')).toBeInTheDocument();
    resolve();
  });

  it('moves focus to the Confirm button when revealed', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('confirm'));
    expect(screen.getByTestId('confirm-confirm')).toHaveFocus();
  });

  it('exposes a role="group" labelled by the prompt for assistive tech', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('confirm'));
    expect(screen.getByRole('group', { name: 'Delete this item?' })).toBeInTheDocument();
  });

  it('renders both options as text-labelled buttons (never icon-only / toggle-like)', () => {
    renderButton({ confirmLabel: 'Delete', cancelLabel: 'Cancel' });
    fireEvent.click(screen.getByTestId('confirm'));

    // Best practice: the action lives in the button text, so the choice does
    // not rely on colour alone and never looks like a toggle switch.
    expect(screen.getByTestId('confirm-confirm')).toHaveTextContent('Delete');
    expect(screen.getByTestId('confirm-cancel')).toHaveTextContent('Cancel');
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
