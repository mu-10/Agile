// Mock for Google Maps API
global.google = {
  maps: {
    Map: jest.fn(() => ({
      setCenter: jest.fn(),
      setZoom: jest.fn(),
      addListener: jest.fn(),
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
    Size: jest.fn((width, height) => ({ width, height })),
    LatLng: jest.fn((lat, lng) => ({ lat, lng })),
    event: {
      addListener: jest.fn(),
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
}));