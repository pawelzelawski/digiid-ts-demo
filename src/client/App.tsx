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
    console.log('Requesting new Digi-ID session...');

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
      console.error('Error starting Digi-ID session:', err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(`Failed to initiate Digi-ID: ${message}`);
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
      <h1>Digi-ID TypeScript Integration Demo</h1>

      {/* --- Views based on uiState --- */}
      {uiState === 'initial' && (
        <div className="initial-view">
          <button onClick={handleStart} disabled={isLoading} className="signin-button">
            <img src="/assets/digiid-logo.png" alt="Digi-ID Logo" width="24" height="24" />
            <span>{isLoading ? 'Generating QR...' : 'Sign in with Digi-ID'}</span>
          </button>
        </div>
      )}

      {uiState !== 'initial' && (
        <div className="view-container">
          {uiState === 'waiting' && qrCodeDataUrl && (
            <div className="waiting-view view-box">
              <h2>Scan the QR Code</h2>
              <p>Scan the QR code below using your Digi-ID compatible mobile wallet.</p>
              <img src={qrCodeDataUrl} alt="Digi-ID QR Code" width="250" />
              <p>Waiting for authentication...</p>
              <button onClick={handleReset}>Cancel</button>
            </div>
          )}

          {uiState === 'success' && resultData?.address && (
            <div className="success-view view-box">
              <svg xmlns="http://www.w3.org/2000/svg" className="checkmark-icon" viewBox="0 0 52 52">
                <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
              </svg>
              <h2>Authentication Successful!</h2>
              <p>Verified Address:</p>
              <p className="address">{resultData.address}</p>
              <p>Address Format: {getDigiByteAddressType(resultData.address)}</p>
              <button onClick={handleReset}>Start Over</button>
            </div>
          )}

          {uiState === 'failed' && (
            <div className="failed-view view-box">
              <h2>Authentication Failed</h2>
              <p className="error-message">
                Reason: {resultData?.error || error || 'An unknown error occurred.'}
              </p>
              <button onClick={handleReset}>Try Again</button>
            </div>
          )}
        </div>
      )}

      {/* --- Description section (Always visible below the view container) --- */}
      <div className="description">
        <p className="code-link">
          This application demonstrates integrating Digi-ID authentication using the <a href="https://github.com/pawelzelawski/digiid-ts" target="_blank" rel="noopener noreferrer">digiid-ts</a> library.
        </p>
        <p>
          Upon successful verification, the system can identify the following DigiByte address formats:
        </p>
        <ul>
          <li>Legacy Addresses (P2PKH) - starting with 'D'</li>
          <li>Pay-to-Script-Hash Addresses (P2SH) - commonly starting with 'S'</li>
          <li>Segregated Witness (SegWit) Addresses - starting with 'dgb1'</li>
        </ul>
      </div>
    </div>
  );
}

export default App; 