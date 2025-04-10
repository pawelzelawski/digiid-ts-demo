import React, { useState, useEffect } from 'react';
import { getDigiByteAddressType } from './utils'; // Import the address type helper

// Define the possible UI states
type UiState = 'initial' | 'waiting' | 'success' | 'failed';

// Define the structure for result data (success or failure)
interface ResultData {
  address?: string; // Present on success
  error?: string;   // Present on failure
  addressType?: string; // Added later
}

function App() {
  const [uiState, setUiState] = useState<UiState>('initial');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null); // For general fetch errors

  // Polling interval for status check (in milliseconds)
  const POLLING_INTERVAL = 2000; // Check every 2 seconds

  // Effect for polling the status endpoint when in 'waiting' state
  useEffect(() => {
    // Only poll if we are in the waiting state and have a session ID
    if (uiState !== 'waiting' || !sessionId) {
      return; // Exit if not applicable
    }

    console.log(`Starting status polling for session: ${sessionId}`);
    let intervalId: any = null; // Use 'any' to avoid browser/node type conflict for setInterval return type

    const checkStatus = async () => {
      if (!sessionId) return; // Should not happen here, but type guard

      console.log(`Checking status for session: ${sessionId}`);
      try {
        const response = await fetch(`/api/digiid/status/${sessionId}`);
        if (!response.ok) {
          // Handle specific errors like 404 (session not found/expired)
          if (response.status === 404) {
            console.warn(`Session ${sessionId} not found or expired during polling.`);
            setError('Session expired or could not be found.');
            setUiState('failed'); // Transition to failed state
            setResultData({ error: 'Session expired or could not be found.' });
          } else {
            const errorData = await response.json().catch(() => ({ message: 'Error fetching status' }));
            throw new Error(errorData.message || `Server responded with ${response.status}`);
          }
          if (intervalId) clearInterval(intervalId); // Stop polling on error
          return;
        }

        const data: { status: UiState, address?: string, error?: string } = await response.json();
        console.log('Received status data:', data);

        // If status changed from pending, update UI and stop polling
        if (data.status === 'success') {
          setResultData({ address: data.address });
          setUiState('success');
          if (intervalId) clearInterval(intervalId);
        } else if (data.status === 'failed') {
          setResultData({ error: data.error || 'Authentication failed.' });
          setUiState('failed');
          if (intervalId) clearInterval(intervalId);
        }
        // If status is still 'pending', the interval will continue

      } catch (err) {
        console.error('Error polling status:', err);
        const message = err instanceof Error ? err.message : 'An unknown error occurred during status check';
        setError(`Status polling failed: ${message}`);
        // Decide if we should stop polling or transition state on generic fetch error
        // For now, let's stop polling and show error, moving to failed state
        setResultData({ error: `Status polling failed: ${message}` });
        setUiState('failed');
        if (intervalId) clearInterval(intervalId);
      }
    };

    // Start the interval
    intervalId = setInterval(checkStatus, POLLING_INTERVAL);

    // Cleanup function to clear the interval when the component unmounts
    // or when the dependencies (uiState, sessionId) change
    return () => {
      if (intervalId) {
        console.log(`Stopping status polling for session: ${sessionId}`);
        clearInterval(intervalId);
      }
    };
  }, [uiState, sessionId]); // Dependencies for the effect

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);
    setQrCodeDataUrl(null); // Clear previous QR code if any
    setSessionId(null);
    setResultData(null);
    console.log('Requesting new DigiID session...');

    try {
      const response = await fetch('/api/digiid/start');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to start session. Server responded with status: ' + response.status }));
        throw new Error(errorData.message || 'Failed to start session');
      }
      const data = await response.json();
      console.log('Received session data:', data);
      setSessionId(data.sessionId);
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setUiState('waiting'); // Move to waiting state
    } catch (err) {
      console.error('Error starting DigiID session:', err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(`Failed to initiate DigiID: ${message}`);
      setUiState('initial'); // Stay in initial state on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    // TODO: Implement reset logic
    console.log('Resetting flow...');
    setUiState('initial');
    setSessionId(null);
    setQrCodeDataUrl(null);
    setResultData(null);
    setError(null);
    setIsLoading(false);
  };

  return (
    <div className="app-container">
      <h1>DigiID-TS Demo</h1>

      {/* --- Initial State --- */} 
      {uiState === 'initial' && (
        <div className="initial-view">
          <h2>Welcome</h2>
          <p>Click the button below to generate a DigiID login QR code.</p>
          {/* TODO: Add Icon here */}
          {/* <img src="/assets/YOUR_ICON_FILENAME.png" alt="DigiID Icon" width="100" /> */}
          <button onClick={handleStart} disabled={isLoading}>
            {isLoading ? 'Generating QR...' : 'Start DigiID Login'}
          </button>
        </div>
      )}

      {/* --- Waiting State --- */} 
      {uiState === 'waiting' && qrCodeDataUrl && (
        <div className="waiting-view">
          <h2>Scan the QR Code</h2>
          <p>Scan the QR code below using your DigiID compatible mobile wallet.</p>
          <img src={qrCodeDataUrl} alt="DigiID QR Code" width="250" />
          <p>Waiting for authentication...</p>
          {/* Optional: Add a cancel button here */} 
          <button onClick={handleReset}>Cancel</button>
        </div>
      )}

      {/* --- Success State --- */} 
      {uiState === 'success' && resultData?.address && (
        <div className="success-view">
          <h2>Authentication Successful!</h2>
          <p>Verified Address:</p>
          <p className="address">{resultData.address}</p>
          <p>Address Type: {getDigiByteAddressType(resultData.address)}</p>
          <button onClick={handleReset}>Start Over</button>
        </div>
      )}

      {/* --- Failed State --- */} 
      {uiState === 'failed' && (
        <div className="failed-view">
          <h2>Authentication Failed</h2>
          <p className="error-message">
            Reason: {resultData?.error || error || 'An unknown error occurred.'}
          </p>
          <button onClick={handleReset}>Try Again</button>
        </div>
      )}

      {/* General error display (e.g., for initial start error) */} 
      {error && uiState === 'initial' && <p className="error-message">Error: {error}</p>}
    </div>
  );
}

export default App; 