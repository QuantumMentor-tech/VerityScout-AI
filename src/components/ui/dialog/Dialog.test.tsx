import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useRef, useState } from 'react';
import { Dialog } from './Dialog';

describe('Dialog Component', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders modal dialog with accessible title, description, and content when isOpen is true', () => {
    const handleClose = vi.fn();
    render(
      <Dialog
        isOpen={true}
        onClose={handleClose}
        title="Confirmation Required"
        description="Please confirm your operational parameters."
        id="confirm-dialog"
      >
        <div>Modal Body Text</div>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Confirmation Required' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-description');

    expect(screen.getByText('Modal Body Text')).toBeInTheDocument();
  });

  it('calls onClose when close button is activated', () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Test Dialog">
        <div>Content</div>
      </Dialog>
    );

    const closeButton = screen.getByRole('button', { name: 'Close dialog' });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses via Escape key when closeOnEscape is true', () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Escape Test">
        <div>Content</div>
      </Dialog>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss via Escape key when closeOnEscape is false', () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Locked Dialog" closeOnEscape={false}>
        <div>Content</div>
      </Dialog>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('calls onClose when clicking the backdrop', () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Backdrop Test">
        <div>Content</div>
      </Dialog>
    );

    const backdrop = screen.getByTestId('dialog-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the dialog body', () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Click Test">
        <button type="button">Inside Button</button>
      </Dialog>
    );

    const insideButton = screen.getByRole('button', { name: 'Inside Button' });
    fireEvent.click(insideButton);
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('locks and restores document.body.style.overflow', () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <Dialog isOpen={false} onClose={handleClose} title="Scroll Lock Test">
        <div>Content</div>
      </Dialog>
    );

    expect(document.body.style.overflow).toBe('');

    rerender(
      <Dialog isOpen={true} onClose={handleClose} title="Scroll Lock Test">
        <div>Content</div>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Dialog isOpen={false} onClose={handleClose} title="Scroll Lock Test">
        <div>Content</div>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('restores focus to invoking trigger when closed', async () => {
    function DialogHarness() {
      const [isOpen, setIsOpen] = useState(false);
      const buttonRef = useRef<HTMLButtonElement>(null);

      return (
        <div>
          <button ref={buttonRef} type="button" onClick={() => setIsOpen(true)}>
            Open Dialog
          </button>
          <Dialog
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            title="Focus Test"
            triggerRef={buttonRef}
          >
            <div>Body</div>
          </Dialog>
        </div>
      );
    }

    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: 'Open Dialog' });

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
