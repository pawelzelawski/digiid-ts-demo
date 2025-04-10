import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import qrcode from 'qrcode';
// Import actual functions from the linked library
import { generateDigiIDUri, verifyDigiIDCallback, DigiIDError } from 'digiid-ts';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory storage for demo purposes
interface SessionState {
  nonce: string;
  status: 'pending' | 'success' | 'failed';
  address?: string;
  error?: string;
}
const sessionStore = new Map<string, SessionState>();
const nonceToSessionMap = new Map<string, string>();

// Middleware
app.use(express.json());

console.log('Server starting...');
console.log(`Attempting to listen on port: ${PORT}`);
console.log(`Configured PUBLIC_URL: ${process.env.PUBLIC_URL}`);

// Endpoint to initiate the DigiID authentication flow
app.get('/api/digiid/start', async (req: Request, res: Response) => {
  try {
    const sessionId = randomBytes(16).toString('hex');
    const nonce = randomBytes(16).toString('hex');

    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) {
      console.error('PUBLIC_URL environment variable is not set.');
      return res.status(500).json({ error: 'Server configuration error: PUBLIC_URL is missing.' });
    }

    let callbackUrl: string;
    try {
      const baseUrl = new URL(publicUrl);
      callbackUrl = new URL('/api/digiid/callback', baseUrl).toString();
    } catch (error) {
       console.error('Invalid PUBLIC_URL format:', publicUrl, error);
       return res.status(500).json({ error: 'Server configuration error: Invalid PUBLIC_URL format.' });
    }

    const unsecure = callbackUrl.startsWith('http://');
    const digiIdUri = generateDigiIDUri({ callbackUrl, unsecure, nonce });
    console.log(`Generated DigiID URI: ${digiIdUri} for session ${sessionId}`);

    sessionStore.set(sessionId, { nonce, status: 'pending' });
    nonceToSessionMap.set(nonce, sessionId);
    console.log(`Stored pending session: ${sessionId}, nonce: ${nonce}`);

    const qrCodeDataUrl = await qrcode.toDataURL(digiIdUri);
    res.json({ sessionId, qrCodeDataUrl });

  } catch (error) {
    console.error('Error in /api/digiid/start:', error);
    // Check if it's a DigiIDError specifically from generateDigiIDUri
    if (error instanceof DigiIDError) {
        res.status(400).json({ error: `Failed to generate URI: ${error.message}` });
    } else {
        res.status(500).json({ error: 'Internal server error during start' });
    }
  }
});

// Callback endpoint for the DigiID mobile app
app.post('/api/digiid/callback', async (req: Request, res: Response) => {
  const { address, uri, signature } = req.body;

  // Basic validation of received data
  if (!address || !uri || !signature) {
    console.warn('Callback missing required fields.', { address, uri, signature });
    // Wallet doesn't expect a body on failure, just non-200. Status only for logging/debug.
    return res.status(400).send('Missing required callback parameters.');
  }

  const callbackData = { address, uri, signature };
  console.log('Received callback:', callbackData);

  // --- Nonce Extraction and Session Lookup ---
  let receivedNonce: string | null = null;
  try {
    // DigiID URIs need scheme replaced for standard URL parsing
    const parsableUri = uri.replace(/^digiid:/, 'http:');
    const parsedUri = new URL(parsableUri);
    receivedNonce = parsedUri.searchParams.get('x');
  } catch (error) {
    console.warn('Error parsing received URI:', uri, error);
    return res.status(400).send('Invalid URI format.');
  }

  if (!receivedNonce) {
    console.warn('Nonce (x parameter) not found in received URI:', uri);
    return res.status(400).send('Nonce not found in URI.');
  }

  const sessionId = nonceToSessionMap.get(receivedNonce);
  if (!sessionId) {
    console.warn('Session not found for received nonce:', receivedNonce);
    // Nonce might be expired or invalid
    return res.status(404).send('Session not found or expired for this nonce.');
  }

  // Retrieve the session *before* the try/finally block for verification
  const session = sessionStore.get(sessionId);
  if (!session) {
      // This case should be rare if nonceToSessionMap is consistent
      console.error(`Critical: Session data missing for ${sessionId} despite nonce match.`);
      return res.status(500).send('Internal server error: Session data missing.');
  }
  if (session.status !== 'pending') {
      console.warn('Session already processed:', sessionId, session.status);
      // Treat as success here, client will get final status via polling
      return res.status(200).send('Session already processed.');
  }


  // --- Verification ---
  let expectedCallbackUrl: string;
  try {
    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) {
        // Throw specific error to be caught below
        throw new Error('PUBLIC_URL environment variable is not configured on the server.');
    }
    // Construct expected URL based on server config *at time of verification*
    expectedCallbackUrl = new URL('/api/digiid/callback', publicUrl).toString();
  } catch (error) {
    // Handle errors during expected URL construction (e.g., invalid PUBLIC_URL)
    console.error('Server configuration error constructing expected callback URL:', error);
    session.status = 'failed';
    session.error = 'Server configuration error preventing verification.';
    // Update store immediately on this specific failure
    sessionStore.set(sessionId, session);
    // Respond 200 OK as per protocol, but status endpoint will show the config error
    return res.status(200).send();
  }

  const verifyOptions = { expectedCallbackUrl, expectedNonce: session.nonce };

  try {
    console.log('Attempting to verify callback with:', { callbackData, verifyOptions });
    // verifyDigiIDCallback throws DigiIDError on failure
    await verifyDigiIDCallback(callbackData, verifyOptions);

    // Success case
    console.log(`Verification successful for session ${sessionId}, address: ${address}`);
    session.status = 'success';
    session.address = address; // Store the verified address
    session.error = undefined; // Clear any previous error
    nonceToSessionMap.delete(session.nonce); // Clean up nonce map only on success

  } catch (error) {
    // Failure case (verifyDigiIDCallback threw an error)
    console.warn(`Verification failed for session ${sessionId}:`, error);
    session.status = 'failed';
    if (error instanceof DigiIDError) {
      session.error = error.message; // Use message from DigiIDError
    } else if (error instanceof Error) {
      session.error = `Unexpected verification error: ${error.message}`;
    } else {
      session.error = 'An unknown verification error occurred.';
    }
    // Optionally cleanup nonce map on failure too, depending on policy
    // nonceToSessionMap.delete(session.nonce);
  } finally {
    // Update store with final status (success/failed) and respond 200 OK
    sessionStore.set(sessionId, session);
    console.log(`Final session state for ${sessionId}:`, session);
    // Wallet expects 200 OK regardless of internal success/fail.
    // Client uses /status endpoint to get the actual result.
    res.status(200).send();
  }
});

// Endpoint to check the status of an authentication session
app.get('/api/digiid/status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionStore.get(sessionId);
  if (!session) {
    // Session ID is unknown or expired (and cleaned up)
    return res.status(404).json({ status: 'not_found' });
  }
  // Return only relevant fields to client
  const { status, address, error } = session;
  res.json({ status, address, error });
});

// Simple root endpoint
app.get('/', (_: Request, res: Response) => {
  res.send('DigiID Demo Backend Running!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});