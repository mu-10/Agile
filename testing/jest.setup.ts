// Jest setup
import "@testing-library/jest-dom";
import "../../__mocks__/google-maps";

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
        { id: 1, title: "Test Station", latitude: 10, longitude: 20 },
      ]),
    })
  ) as jest.Mock;
});
