import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'crypto';
import qrcode from 'qrcode';
import { generateDigiIDUri, verifyDigiIDCallback } from 'digiid-ts';

dotenv.config();

type SessionStatus = 'pending' | 'success' | 'failed';

interface SessionState {
  nonce: string;
  status: SessionStatus;
  createdAt: number;
  address?: string;
  error?: string;
}

interface AppConfig {
  publicUrl?: string;
  sessionTtlMs: number;
  maxSessions: number;
  nodeEnv: string;
}

const defaultConfig: AppConfig = {
  publicUrl: process.env.PUBLIC_URL,
  sessionTtlMs: Number.parseInt(process.env.SESSION_TTL_MS ?? '300000', 10),
  maxSessions: Number.parseInt(process.env.MAX_SESSIONS ?? '1000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};

const isMainModule = () => {
  if (!process.argv[1]) return false;
  return import.meta.url === new URL(`file://${process.argv[1]}`).href;
};

export function createApp(configOverrides: Partial<AppConfig> = {}) {
  const config: AppConfig = { ...defaultConfig, ...configOverrides };
  const isProduction = config.nodeEnv === 'production';

  const sessionStore = new Map<string, SessionState>();
  const nonceToSessionMap = new Map<string, string>();

  const log = (...args: unknown[]) => {
    if (!isProduction) {
      console.log(...args);
    }
  };

  const purgeExpiredSessions = () => {
    const now = Date.now();
    const expiredSessionIds: string[] = [];

    for (const [sessionId, session] of sessionStore.entries()) {
      if (now - session.createdAt > config.sessionTtlMs) {
        expiredSessionIds.push(sessionId);
      }
    }

    for (const sessionId of expiredSessionIds) {
      const session = sessionStore.get(sessionId);
      if (session) {
        nonceToSessionMap.delete(session.nonce);
      }
      sessionStore.delete(sessionId);
    }
  };

  const cleanupTimer = setInterval(purgeExpiredSessions, 60_000);
  cleanupTimer.unref();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  const startLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many start requests. Please try again shortly.' },
  });

  const callbackLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many callback requests. Please try again shortly.',
  });

  const statusLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many status requests. Please try again shortly.' },
  });

  app.get(
    '/api/digiid/start',
    startLimiter,
    async (_req: Request, res: Response, _next: NextFunction) => {
      purgeExpiredSessions();

      if (sessionStore.size >= config.maxSessions) {
        res.status(503).json({
          error: 'Too many pending sessions. Please try again in a moment.',
        });
        return;
      }

      try {
        const sessionId = randomBytes(16).toString('hex');
        const nonce = randomBytes(16).toString('hex');

        if (!config.publicUrl) {
          console.error('PUBLIC_URL environment variable is not set.');
          res.status(500).json({
            error: 'Server configuration error: PUBLIC_URL is missing.',
          });
          return;
        }

        let callbackUrl: string;
        try {
          const baseUrl = new URL(config.publicUrl);
          callbackUrl = new URL('/api/digiid/callback', baseUrl).toString();
        } catch (error) {
          console.error('Invalid PUBLIC_URL format:', config.publicUrl, error);
          res.status(500).json({
            error: 'Server configuration error: Invalid PUBLIC_URL format.',
          });
          return;
        }

        const unsecure = callbackUrl.startsWith('http://');
        const digiIdUri = generateDigiIDUri({ callbackUrl, unsecure, nonce });
        const qrCodeDataUrl = await qrcode.toDataURL(digiIdUri);

        sessionStore.set(sessionId, {
          nonce,
          status: 'pending',
          createdAt: Date.now(),
        });
        nonceToSessionMap.set(nonce, sessionId);
        log(`Created DigiID session ${sessionId}.`);

        res.json({ sessionId, qrCodeDataUrl });
        return;
      } catch (error) {
        console.error('Error in /api/digiid/start:', error);
        if (error instanceof Error) {
          res
            .status(400)
            .json({ error: `Failed to generate URI: ${error.message}` });
          return;
        }
        res.status(500).json({ error: 'Internal server error during start' });
        return;
      }
    }
  );

  app.post(
    '/api/digiid/callback',
    callbackLimiter,
    async (req: Request, res: Response, _next: NextFunction) => {
      const { address, uri, signature } = req.body;

      if (
        typeof address !== 'string' ||
        typeof uri !== 'string' ||
        typeof signature !== 'string'
      ) {
        res.status(400).send('Missing required callback parameters.');
        return;
      }

      let receivedNonce: string | null;
      try {
        const parsableUri = uri.replace(/^digiid:/, 'http:');
        const parsedUri = new URL(parsableUri);
        receivedNonce = parsedUri.searchParams.get('x');
      } catch {
        res.status(400).send('Invalid URI format.');
        return;
      }

      if (!receivedNonce) {
        res.status(400).send('Nonce not found in URI.');
        return;
      }

      purgeExpiredSessions();
      const sessionId = nonceToSessionMap.get(receivedNonce);
      if (!sessionId) {
        res.status(404).send('Session not found or expired for this nonce.');
        return;
      }

      const session = sessionStore.get(sessionId);
      if (!session) {
        res.status(500).send('Internal server error: Session data missing.');
        return;
      }

      if (session.status !== 'pending') {
        res.status(200).send('Session already processed.');
        return;
      }

      if (!config.publicUrl) {
        session.status = 'failed';
        session.error = 'Server configuration error preventing verification.';
        nonceToSessionMap.delete(session.nonce);
        sessionStore.set(sessionId, session);
        res.status(200).send();
        return;
      }

      let expectedCallbackUrl: string;
      try {
        expectedCallbackUrl = new URL(
          '/api/digiid/callback',
          config.publicUrl
        ).toString();
      } catch (error) {
        console.error(
          'Invalid PUBLIC_URL format while verifying callback:',
          error
        );
        session.status = 'failed';
        session.error = 'Server configuration error preventing verification.';
        nonceToSessionMap.delete(session.nonce);
        sessionStore.set(sessionId, session);
        res.status(200).send();
        return;
      }

      const verifyOptions = {
        expectedCallbackUrl,
        expectedNonce: session.nonce,
      };

      try {
        await verifyDigiIDCallback({ address, uri, signature }, verifyOptions);
        session.status = 'success';
        session.address = address;
        session.error = undefined;
        nonceToSessionMap.delete(session.nonce);
      } catch (error) {
        session.status = 'failed';
        session.error =
          error instanceof Error
            ? error.message
            : 'An unknown verification error occurred.';
        nonceToSessionMap.delete(session.nonce);
      }

      sessionStore.set(sessionId, session);
      res.status(200).send();
      return;
    }
  );

  app.get(
    '/api/digiid/status/:sessionId',
    statusLimiter,
    (req: Request, res: Response) => {
      purgeExpiredSessions();
      const { sessionId } = req.params;
      const session = sessionStore.get(sessionId);

      if (!session) {
        res.status(404).json({ status: 'not_found' });
        return;
      }

      const { status, address, error } = session;
      res.json({ status, address, error });
      return;
    }
  );

  app.get('/', (_req: Request, res: Response) => {
    res.send('DigiID Demo Backend Running!');
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}

export function startServer() {
  const app = createApp();
  const port = Number.parseInt(process.env.PORT ?? '3001', 10);

  return app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

if (isMainModule()) {
  startServer();
}
