# Digi-ID TypeScript Integration Demo

A demonstration application showcasing the integration of the [`digiid-ts`](https://github.com/pawelzelawski/digiid-ts) library for Digi-ID authentication. This project provides a simple, responsive web application with a React frontend and Express backend, demonstrating the complete Digi-ID authentication flow.

## Live Demo

You can view a live demo of this application deployed here: [https://digi-id.pzelawski.dev/](https://digi-id.pzelawski.dev/)

## Features

- **Digi-ID Authentication**: Complete implementation of the Digi-ID authentication protocol
- **QR Code Generation**: Automatic QR code generation for mobile wallet scanning
- **Address Verification**: Verification of DigiByte addresses and their types
- **Responsive Design**: Mobile-friendly interface with clean, modern styling
- **TypeScript Support**: Full type safety throughout the application
- **Environment Configuration**: Flexible configuration through environment variables

## Project Structure

```
digiid-ts-demo/
├── src/
│   ├── client/          # React frontend
│   │   ├── App.tsx      # Main application component
│   │   ├── main.tsx     # Frontend entry point
│   │   └── index.css    # Global styles
│   └── server/          # Express backend
│       ├── main.ts      # Server entry point
│       └── utils.ts     # Utility functions
├── public/              # Static assets
├── .env                 # Environment variables
└── package.json         # Project dependencies
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A DigiByte wallet that supports Digi-ID (e.g., DigiByte Go)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/pawelzelawski/digiid-ts-demo.git
   cd digiid-ts-demo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3001
   PUBLIC_URL=https://your-domain.com
   ```

### Running the Application

Start the development server:
```bash
npm run dev
```

This will start both the frontend and backend servers concurrently.

## Authentication Flow

1. User clicks "Sign in with Digi-ID" button
2. System generates a unique session and QR code
3. User scans QR code with their DigiByte wallet
4. Wallet signs the authentication request
5. System verifies the signature and returns the authenticated address
6. User sees their verified DigiByte address and its type

## Code Examples

### Backend Implementation

Here's how to implement the Digi-ID authentication endpoints:

```typescript
// Generate Digi-ID URI and QR code
app.get('/api/digiid/start', async (req: Request, res: Response) => {
  const sessionId = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const callbackUrl = new URL('/api/digiid/callback', process.env.PUBLIC_URL).toString();
  
  const digiIdUri = generateDigiIDUri({ 
    callbackUrl, 
    unsecure: !callbackUrl.startsWith('https'),
    nonce 
  });
  
  const qrCodeDataUrl = await qrcode.toDataURL(digiIdUri);
  res.json({ sessionId, qrCodeDataUrl });
});

// Handle Digi-ID callback
app.post('/api/digiid/callback', async (req: Request, res: Response) => {
  const { address, uri, signature } = req.body;
  const expectedCallbackUrl = new URL('/api/digiid/callback', process.env.PUBLIC_URL).toString();
  
  const isValid = verifyDigiIDCallback({
    address,
    uri,
    signature,
    expectedCallbackUrl,
    expectedNonce: sessionStore.get(sessionId)?.nonce
  });
  
  if (isValid) {
    res.status(200).send();
  } else {
    res.status(400).send('Invalid signature');
  }
});
```

### Frontend Implementation

Here's how to integrate Digi-ID authentication in your React application:

```typescript
// Handle authentication flow
const handleDigiIDAuth = async () => {
  try {
    const response = await fetch('/api/digiid/start');
    const { sessionId, qrCodeDataUrl } = await response.json();
    
    // Start polling for authentication status
    const pollStatus = setInterval(async () => {
      const statusResponse = await fetch(`/api/digiid/status/${sessionId}`);
      const { status, address } = await statusResponse.json();
      
      if (status === 'success') {
        clearInterval(pollStatus);
        setAuthenticatedAddress(address);
      }
    }, 1000);
    
    return () => clearInterval(pollStatus);
  } catch (error) {
    console.error('Authentication failed:', error);
  }
};
```

### Environment Configuration

Example `.env` file configuration:

```env
# Server configuration
PORT=3001
PUBLIC_URL=https://your-domain.com
```

## Environment Variables

- `PORT`: Port number for the backend server (default: 3001)
- `PUBLIC_URL`: The public URL of your application (required for callback handling)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [DigiByte](https://www.digibyte.org/) - The underlying blockchain technology
- [digiid-ts](https://github.com/pawelzelawski/digiid-ts) - The TypeScript library for Digi-ID authentication