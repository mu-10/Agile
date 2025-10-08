// Server-side configuration for Node.js backend
// This mirrors the frontend config but in CommonJS format for Node.js

// Load environment variables from .env file
require('dotenv').config();

const config = {
  // Server configuration - matches what server.js expects
  server: {
    port: process.env.PORT || 8080, // Use PORT from .env or default to 8080
    getUrl: function() {
      return `http://localhost:${this.port}`;
    }
  },
  
  // Google Maps API configuration - load from environment variables
  googleMapsApiKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY || process.env.GOOGLE_MAPS_SERVER_KEY,
  
  // Also add it in a maps object in case server.js expects it there
  maps: {
    googleMapsApiKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY || process.env.GOOGLE_MAPS_SERVER_KEY
  },
  
  // Additional ports for reference
  ports: {
    backend: 8080,
    frontend: 3000,
    expo: 8081,
  },
  
  // API configuration
  api: {
    endpoints: {
      chargingStations: '/api/charging-stations',
      findChargingStop: '/api/find-charging-stop',
      validateStationReachability: '/api/validate-station-reachability',
    }
  },
  
  // Database and external service settings
  database: {
    // Add database configuration here if needed
  },
  
  // CORS settings
  cors: {
    origin: [
      `http://localhost:${3000}`, // frontend
      `http://localhost:${8081}`, // expo
    ],
    credentials: true,
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
  }
};

// Validate that required environment variables are present
if (!config.googleMapsApiKey) {
  console.warn('Warning: Google Maps API key not found in environment variables. Please check your .env file for EXPO_PUBLIC_MAPS_WEB_KEY or GOOGLE_MAPS_SERVER_KEY');
}

// Export for CommonJS (Node.js)
module.exports = config;
