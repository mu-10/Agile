// Mock for Google Maps API
global.google = {
  maps: {
    Map: jest.fn(() => ({
      setCenter: jest.fn(),
      setZoom: jest.fn(),
      addListener: jest.fn(),
      getBounds: jest.fn(() => ({
        getNorthEast: () => ({ lat: () => 60, lng: () => 19 }),
        getSouthWest: () => ({ lat: () => 55, lng: () => 11 }),
      })),
    })),
    Marker: jest.fn(() => ({
      setPosition: jest.fn(),
      setMap: jest.fn(),
      addListener: jest.fn(),
    })),
    InfoWindow: jest.fn(() => ({
      open: jest.fn(),
      close: jest.fn(),
      setContent: jest.fn(),
    })),
    DirectionsService: jest.fn(() => ({
      route: jest.fn((request, callback) => {
        // Mock successful directions response with proper structure
        callback({
          routes: [{
            overview_path: [
              { lat: () => 59.3293, lng: () => 18.0686 }, // Stockholm
              { lat: () => 57.7089, lng: () => 11.9746 }, // Gothenburg
            ],
            legs: [{
              distance: { text: "470 km", value: 470000 },
              duration: { text: "4 hours 30 mins", value: 16200 },
            }]
          }]
        }, 'OK');
      }),
    })),
    DirectionsRenderer: jest.fn(() => ({
      setDirections: jest.fn(),
      setMap: jest.fn(),
    })),
    Size: jest.fn((width, height) => ({ width, height })),
    LatLng: jest.fn((lat, lng) => ({ lat, lng })),
    DirectionsStatus: {
      OK: 'OK',
    },
    TravelMode: {
      DRIVING: 'DRIVING',
    },
    event: {
      addListener: jest.fn(),
    },
    geometry: {
      spherical: {
        computeDistanceBetween: jest.fn(() => 1000), // Return 1km distance
      },
    },
  },
};

// Mock for useJsApiLoader
const { createElement } = require('react');

jest.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({
    isLoaded: true,
    loadError: null,
  }),
  GoogleMap: ({ children }) => createElement('div', { 'data-testid': 'google-map' }, children),
  Marker: () => createElement('div', { 'data-testid': 'marker' }),
  InfoWindow: ({ children }) => createElement('div', { 'data-testid': 'info-window' }, children),
  DirectionsRenderer: () => createElement('div', { 'data-testid': 'directions-renderer' }),
}));