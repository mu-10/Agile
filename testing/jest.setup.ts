// Jest setup
import "@testing-library/jest-dom";
import "../__mocks__/google-maps";

beforeAll(() => {
  (global.navigator as any).geolocation = {
    getCurrentPosition: jest.fn().mockImplementation((success) =>
      success({
        coords: { latitude: 10, longitude: 20 },
      })
    ),
  };
});

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve([
        { 
          id: 1, 
          title: "Test Station 1", 
          latitude: 59.3293, 
          longitude: 18.0686,
          address: "Stockholm", 
          connections: [{ type: "Type 2", powerKW: 22 }] 
        },
        { 
          id: 2, 
          title: "Test Station 2", 
          latitude: 57.7089, 
          longitude: 11.9746,
          address: "Gothenburg", 
          connections: [{ type: "CCS", powerKW: 50 }] 
        },
      ]),
    })
  ) as jest.Mock;
});
