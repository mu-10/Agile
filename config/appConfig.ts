// Central configuration file for all application settings
// Change ports and other settings here

export const APP_CONFIG = {
  // Server ports
  ports: {
    backend: 4000, // Updated to match actual server port
    frontend: 3000,
    expo: 8081,
  },
  
  // API endpoints
  api: {
    baseUrl: `http://localhost:8080`, // Will be updated dynamically
    endpoints: {
      chargingStations: '/api/charging-stations',
      findChargingStop: '/api/find-charging-stop',
      validateStationReachability: '/api/validate-station-reachability',
    }
  },
  
  // Google Maps configuration
  maps: {
    defaultCenter: {
      lat: 57.7089,
      lng: 11.9746
    },
    defaultZoom: 12,
    libraries: ["places", "geometry"] as const,
  },
  
  // Battery and routing defaults
  defaults: {
    batteryRange: 300, // km
    batteryCapacity: 75, // kWh
    maxStationDistance: 2000, // meters from route
  },
  
  // UI configuration
  ui: {
    animationDuration: 300, // ms
    debounceDelay: 300, // ms for map bounds changes
    maxStationsPerRequest: {
      zoomedOut: 5000,   // zoom <= 8
      medium: 2000,      // zoom <= 10  
      zoomedIn: 1000,    // zoom > 10
    }
  }
};

// Update base URL when ports change
APP_CONFIG.api.baseUrl = `http://localhost:${APP_CONFIG.ports.backend}`;

// Helper function to get full API URLs
export const getApiUrls = () => {
  const baseUrl = APP_CONFIG.api.baseUrl;
  const endpoints = APP_CONFIG.api.endpoints;
  
  return {
    chargingStations: () => `${baseUrl}${endpoints.chargingStations}`,
    findChargingStop: () => `${baseUrl}${endpoints.findChargingStop}`,
    validateStationReachability: () => `${baseUrl}${endpoints.validateStationReachability}`,
  };
};

// Export individual configurations for convenience
export const PORTS = APP_CONFIG.ports;
export const API_ENDPOINTS = getApiUrls();
export const MAPS_CONFIG = APP_CONFIG.maps;
export const DEFAULTS = APP_CONFIG.defaults;
export const UI_CONFIG = APP_CONFIG.ui;

export default APP_CONFIG;
