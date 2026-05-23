// @vitest-environment node

import inject from 'light-my-request';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/server/main';
import qrcode from 'qrcode';
import { generateDigiIDUri, verifyDigiIDCallback } from 'digiid-ts';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,qr'),
  },
}));

vi.mock('digiid-ts', () => ({
  generateDigiIDUri: vi.fn(
    ({ nonce }: { nonce: string }) => `digiid://auth?x=${nonce}`
  ),
  verifyDigiIDCallback: vi.fn(async () => undefined),
}));

const mockedToDataUrl = vi.mocked(qrcode.toDataURL);
const mockedGenerateDigiIDUri = vi.mocked(generateDigiIDUri);
const mockedVerifyDigiIDCallback = vi.mocked(verifyDigiIDCallback);

describe('server api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedToDataUrl.mockResolvedValue('data:image/png;base64,qr');
    mockedGenerateDigiIDUri.mockImplementation(
      ({ nonce }: { nonce: string }) => `digiid://auth?x=${nonce}`
    );
    mockedVerifyDigiIDCallback.mockResolvedValue(undefined);
  });

  it('creates session and returns qr code', async () => {
    const app = createApp({
      publicUrl: 'http://localhost:3001',
      nodeEnv: 'test',
    });

    const response = await inject(app, {
      method: 'GET',
      url: '/api/digiid/start',
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.sessionId).toMatch(/^[a-f0-9]{32}$/);
    expect(body.qrCodeDataUrl).toBe('data:image/png;base64,qr');
    expect(mockedGenerateDigiIDUri).toHaveBeenCalledTimes(1);
    expect(mockedToDataUrl).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when public url is missing', async () => {
    const app = createApp({ publicUrl: undefined, nodeEnv: 'test' });

    const response = await inject(app, {
      method: 'GET',
      url: '/api/digiid/start',
    });
    const body = response.json();

    expect(response.statusCode).toBe(500);
    expect(body.error).toContain('PUBLIC_URL');
  });

  it('marks session as success when callback verifies', async () => {
    const app = createApp({
      publicUrl: 'http://localhost:3001',
      nodeEnv: 'test',
    });

    const start = await inject(app, {
      method: 'GET',
      url: '/api/digiid/start',
    });
    const sessionId = start.json().sessionId as string;
    const nonce = mockedGenerateDigiIDUri.mock.calls[0][0].nonce;
    const callbackUri = `digiid://auth?x=${nonce}`;

    const callback = await inject(app, {
      method: 'POST',
      url: '/api/digiid/callback',
      headers: { 'content-type': 'application/json' },
      payload: {
        address: 'Dabc123456789',
        uri: callbackUri,
        signature: 'signature',
      },
    });
    const status = await inject(app, {
      method: 'GET',
      url: `/api/digiid/status/${sessionId}`,
    });
    const statusBody = status.json();

    expect(callback.statusCode).toBe(200);
    expect(mockedVerifyDigiIDCallback).toHaveBeenCalledWith(
      { address: 'Dabc123456789', uri: callbackUri, signature: 'signature' },
      {
        expectedCallbackUrl: 'http://localhost:3001/api/digiid/callback',
        expectedNonce: nonce,
      }
    );
    expect(status.statusCode).toBe(200);
    expect(statusBody.status).toBe('success');
    expect(statusBody.address).toBe('Dabc123456789');
  });

  it('marks session as failed when callback verification fails', async () => {
    mockedVerifyDigiIDCallback.mockRejectedValueOnce(
      new Error('Invalid signature')
    );
    const app = createApp({
      publicUrl: 'http://localhost:3001',
      nodeEnv: 'test',
    });

    const start = await inject(app, {
      method: 'GET',
      url: '/api/digiid/start',
    });
    const sessionId = start.json().sessionId as string;
    const nonce = mockedGenerateDigiIDUri.mock.calls[0][0].nonce;
    const callbackUri = `digiid://auth?x=${nonce}`;

    await inject(app, {
      method: 'POST',
      url: '/api/digiid/callback',
      headers: { 'content-type': 'application/json' },
      payload: {
        address: 'Dabc123456789',
        uri: callbackUri,
        signature: 'signature',
      },
    });
    const status = await inject(app, {
      method: 'GET',
      url: `/api/digiid/status/${sessionId}`,
    });
    const statusBody = status.json();

    expect(status.statusCode).toBe(200);
    expect(statusBody.status).toBe('failed');
    expect(statusBody.error).toContain('Invalid signature');
  });

  it('enforces max in-memory sessions', async () => {
    const app = createApp({
      publicUrl: 'http://localhost:3001',
      maxSessions: 1,
      nodeEnv: 'test',
    });

    const first = await inject(app, {
      method: 'GET',
      url: '/api/digiid/start',
    });
    const second = await inject(app, {
      method: 'GET',
      url: '/api/digiid/start',
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(503);
  });

  it('expires sessions after ttl', async () => {
    const app = createApp({
      publicUrl: 'http://localhost:3001',
      sessionTtlMs: 1,
      nodeEnv: 'test',
    });

    const start = await inject(app, {
      method: 'GET',
      url: '/api/digiid/start',
    });
    const sessionId = start.json().sessionId as string;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const status = await inject(app, {
      method: 'GET',
      url: `/api/digiid/status/${sessionId}`,
    });
    const statusBody = status.json();

    expect(status.statusCode).toBe(404);
    expect(statusBody.status).toBe('not_found');
  });
});
