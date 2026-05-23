import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/client/App';

describe('App', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows qr code after successful start call', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'session-1',
        qrCodeDataUrl: 'data:image/png;base64,qr',
      }),
    });

    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: /sign in with digi-id/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /scan the qr code/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByAltText('Digi-ID QR Code')).toBeInTheDocument();
  });

  it('transitions to success after polling confirms authentication', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'session-2',
          qrCodeDataUrl: 'data:image/png;base64,qr',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          address: 'D123456789',
        }),
      });

    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: /sign in with digi-id/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/waiting for authentication/i)
      ).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(
          screen.getByText(/authentication successful/i)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    expect(screen.getByText('D123456789')).toBeInTheDocument();
  });

  it('shows start errors in the initial state', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Backend unavailable' }),
    });

    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: /sign in with digi-id/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/failed to initiate digi-id: backend unavailable/i)
      ).toBeInTheDocument();
    });
  });

  it('can cancel waiting flow and return to initial view', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'session-3',
        qrCodeDataUrl: 'data:image/png;base64,qr',
      }),
    });

    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: /sign in with digi-id/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cancel/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(
      screen.getByRole('button', { name: /sign in with digi-id/i })
    ).toBeInTheDocument();
  });
});
