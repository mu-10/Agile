// Test script for charging logic debugging
const { findRecommendedChargingStation } = require('./services/chargingRecommendationService');
const ChargingStationDB = require('./services/databaseService');

async function testChargingLogic() {
  console.log('Testing charging logic...');
  
  const testParams = {
    startLat: 57.7344492,
    startLng: 12.0451919,
    endLat: 59.3327036,
    endLng: 18.0656255,
    batteryLevel: 50, // 50% of 320km = 160km current range  
    maxRange: 320
  };
  
  const start = { lat: testParams.startLat, lng: testParams.startLng };
  const end = { lat: testParams.endLat, lng: testParams.endLng };
  
  // Initialize database
  const db = new ChargingStationDB();
  
  // Get some stations for testing
  const bufferDegrees = 0.3;
  const north = Math.max(start.lat, end.lat) + bufferDegrees;
  const south = Math.min(start.lat, end.lat) - bufferDegrees;
  const east = Math.max(start.lng, end.lng) + bufferDegrees;
  const west = Math.min(start.lng, end.lng) - bufferDegrees;
  
  const stations = db.getStationsInBounds(north, south, east, west, 5000); // Use same limit as frontend (zoomed out)
  console.log(`Found ${stations.length} stations for testing (same as frontend max)`);
  
  try {
    console.log('Making charging station request...');
    const result = await findRecommendedChargingStation(
      start,
      end, 
      testParams.batteryLevel * testParams.maxRange / 100, // Current range in km
      testParams.maxRange,
      stations,
      process.env.GOOGLE_MAPS_API_KEY
    );
    
    console.log('=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error in charging logic:', error);
  }
}

testChargingLogic().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});