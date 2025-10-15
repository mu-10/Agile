// Test script to demonstrate 80% charging logic
const { findRecommendedChargingStation } = require('../services/chargingRecommendationService');

async function test80PercentCharging() {
  console.log('Testing 80% charging implementation...\n');

  // Mock stations for testing - positioned along the Göteborg to Stockholm route
  const mockStations = [
    {
      id: 1,
      title: "Station Near Göteborg",
      latitude: 57.72, // Close to Göteborg
      longitude: 11.98,
    },
    {
      id: 2,
      title: "Station Near Borås", 
      latitude: 57.8, // Along E6/E20 route
      longitude: 12.1,
    },
    {
      id: 3,
      title: "Station Midway 1",
      latitude: 58.3, // Midway point
      longitude: 13.8,
    },
    {
      id: 4,
      title: "Station Midway 2",
      latitude: 58.7, // Another midway point
      longitude: 15.0,
    },
    {
      id: 5,
      title: "Station Near Linköping",
      latitude: 59.0, // Along E4 route
      longitude: 16.5,
    },
    {
      id: 6,
      title: "Station Near Stockholm",
      latitude: 59.25, // Close to Stockholm
      longitude: 17.8,
    }
  ];

  const start = { lat: 57.708870, lng: 11.974560 }; // Göteborg
  const end = { lat: 59.329323, lng: 18.068581 };   // Stockholm

  console.log('=== Test Case 1: Default 80% Charging ===');
  const result80 = await findRecommendedChargingStation(
    start,
    end,
    250, // current range
    400, // max capacity
    mockStations,
    null // no Google Maps API
    // chargePercent defaults to 0.8 (80%)
  );

  console.log('80% charging result:', JSON.stringify(result80, null, 2));

  console.log('\n=== Test Case 2: 100% Charging (for comparison) ===');
  const result100 = await findRecommendedChargingStation(
    start,
    end,
    250, // current range
    400, // max capacity
    mockStations,
    null, // no Google Maps API
    1.0   // 100% charging
  );

  console.log('100% charging result:', JSON.stringify(result100, null, 2));

  console.log('\n=== Test Case 3: Single charge scenario with 80% ===');
  // For single charge, 80% of 600km capacity (480km) should cover the ~449km trip
  const resultSingle = await findRecommendedChargingStation(
    start,
    end,
    200, // current range (less than trip distance)
    600, // high max capacity (80% = 480km would cover trip)
    mockStations,
    null // no Google Maps API
    // chargePercent defaults to 0.8 (80%)
  );

  console.log('Single charge 80% result:', JSON.stringify(resultSingle, null, 2));

  console.log('\n=== Test Case 4: Single charge scenario with 100% (for comparison) ===');
  // For comparison, 100% of 500km capacity should also cover the trip
  const resultSingle100 = await findRecommendedChargingStation(
    start,
    end,
    200, // current range (less than trip distance)
    500, // max capacity (100% = 500km would cover trip)
    mockStations,
    null, // no Google Maps API
    1.0   // 100% charging
  );

  console.log('Single charge 100% result:', JSON.stringify(resultSingle100, null, 2));
}

test80PercentCharging().catch(console.error);