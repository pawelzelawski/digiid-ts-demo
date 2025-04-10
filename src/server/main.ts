import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import qrcode from 'qrcode';
// TODO: Import digiidTs library once linked
// import * as digiidTs from 'digiid-ts';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001; // Default to 3001 if PORT is not set

// In-memory storage for demo purposes
// NOTE: In a production application, use a persistent store (e.g., Redis, database)
interface SessionState {
  nonce: string;
  status: 'pending' | 'success' | 'failed';
  address?: string;
  error?: string;
}
const sessionStore = new Map<string, SessionState>();
const nonceToSessionMap = new Map<string, string>();

// Middleware
app.use(express.json()); // Parse JSON bodies

console.log('Server starting...');
console.log(`Attempting to listen on port: ${PORT}`);
console.log(`Configured PUBLIC_URL: ${process.env.PUBLIC_URL}`);

// TODO: Implement DigiID API endpoints

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

    // Determine if the callback URL is insecure (HTTP)
    const unsecure = callbackUrl.startsWith('http://');

    // Placeholder for digiidTs.generateDigiIDUri call
    // const digiIdUri = digiidTs.generateDigiIDUri({ callbackUrl, unsecure, nonce });
    const digiIdUri = `digiid://example.com?x=${nonce}&unsecure=${unsecure ? 1 : 0}&callback=${encodeURIComponent(callbackUrl)}`; // TEMPORARY PLACEHOLDER
    console.log(`Generated DigiID URI: ${digiIdUri} for session ${sessionId}`);

    // Store session state
    sessionStore.set(sessionId, { nonce, status: 'pending' });
    nonceToSessionMap.set(nonce, sessionId);
    console.log(`Stored pending session: ${sessionId}, nonce: ${nonce}`);

    // Generate QR code
    const qrCodeDataUrl = await qrcode.toDataURL(digiIdUri);

    res.json({ sessionId, qrCodeDataUrl });

  } catch (error) {
    console.error('Error in /api/digiid/start:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Callback endpoint for the DigiID mobile app
app.post('/api/digiid/callback', async (req: Request, res: Response) => {
  const { address, uri, signature } = req.body;

  console.log('Received callback:', { address, uri, signature });

  if (!address || !uri || !signature) {
    console.warn('Callback missing required fields.');
    // Note: DigiID protocol doesn't expect a body response on failure here,
    // just a non-200 status, but sending JSON for easier debugging.
    return res.status(400).json({ error: 'Missing required callback parameters.' });
  }

  let receivedNonce: string | null = null;
  try {
    // Parse the nonce (parameter 'x') from the received URI
    const parsedUri = new URL(uri);
    receivedNonce = parsedUri.searchParams.get('x');
  } catch (error) {
    console.warn('Error parsing received URI:', uri, error);
    return res.status(400).json({ error: 'Invalid URI format.' });
  }

  if (!receivedNonce) {
    console.warn('Nonce (x parameter) not found in received URI:', uri);
    return res.status(400).json({ error: 'Nonce not found in URI.' });
  }

  // Find the session ID associated with the nonce
  const sessionId = nonceToSessionMap.get(receivedNonce);
  if (!sessionId) {
    console.warn('Received nonce does not correspond to any active session:', receivedNonce);
    // This could happen if the session expired or the nonce is invalid/reused
    return res.status(404).json({ error: 'Session not found or expired for this nonce.' });
  }

  // Retrieve the session state
  const session = sessionStore.get(sessionId);
  if (!session || session.status !== 'pending') {
    console.warn('Session not found or not in pending state for ID:', sessionId);
    // Should ideally not happen if nonceToSessionMap is consistent with sessionStore
    return res.status(404).json({ error: 'Session not found or already completed/failed.' });
  }

  // Construct the expected callback URL (must match the one used in /start)
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) {
     // This should have been caught in /start, but double-check
     console.error('PUBLIC_URL is unexpectedly missing during callback.');
     session.status = 'failed';
     session.error = 'Server configuration error: PUBLIC_URL missing.';
     return res.status(500).send(); // Send 500 internal server error
  }
  let expectedCallbackUrl: string;
  try {
     expectedCallbackUrl = new URL('/api/digiid/callback', publicUrl).toString();
  } catch (error) {
     console.error('Invalid PUBLIC_URL format during callback:', publicUrl, error);
     session.status = 'failed';
     session.error = 'Server configuration error: Invalid PUBLIC_URL.';
     return res.status(500).send();
  }

  const expectedNonce = session.nonce;

  try {
    console.log('Verifying callback with:', {
      address,
      uri,
      signature,
      expectedCallbackUrl,
      expectedNonce,
    });

    // Placeholder for digiidTs.verifyDigiIDCallback call
    // const isValid = await digiidTs.verifyDigiIDCallback({
    //   address,
    //   uri,
    //   signature,
    //   callbackUrl: expectedCallbackUrl,
    //   nonce: expectedNonce,
    // });

    // --- TEMPORARY PLACEHOLDER VERIFICATION --- 
    // Simulating verification: check if nonce matches and URI contains expected callback
    const isValid = receivedNonce === expectedNonce && uri.includes(expectedCallbackUrl);
    console.log(`Placeholder verification result: ${isValid}`);
    // --- END PLACEHOLDER --- 

    if (isValid) {
      console.log(`Verification successful for session ${sessionId}, address: ${address}`);
      session.status = 'success';
      session.address = address;
      // Clean up nonce lookup map once verified successfully
      nonceToSessionMap.delete(expectedNonce);
    } else {
      console.warn(`Verification failed for session ${sessionId}`);
      session.status = 'failed';
      session.error = 'Signature verification failed.';
       // Keep nonce in map for potential debugging, or clean up based on policy
      // nonceToSessionMap.delete(expectedNonce);
    }

    // Update the session store
    sessionStore.set(sessionId, session);

    // DigiID protocol expects a 200 OK on success/failure after processing
    res.status(200).send();

  } catch (error) {
    console.error('Error during callback verification process for session:', sessionId, error);
    // Update session state to reflect the error
    session.status = 'failed';
    session.error = 'Internal server error during verification.';
    sessionStore.set(sessionId, session);
    // Don't expose internal errors via status code if possible, but log them
    res.status(200).send(); // Still send 200 as processing happened, but log indicates issue
  }
});

// Endpoint to check the status of an authentication session
app.get('/api/digiid/status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionStore.get(sessionId);

  if (!session) {
    return res.status(404).json({ status: 'not_found' });
  }

  // Return only the necessary fields to the client
  const { status, address, error } = session;
  res.json({ status, address, error }); // address and error will be undefined if not set
});

app.get('/', (_: Request, res: Response) => {
  res.send('DigiID Demo Backend Running!');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 