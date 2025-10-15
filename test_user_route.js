// Test the specific route from the user's logs
const { findRecommendedChargingStation } = require('./services/chargingRecommendationService.js');
const ChargingStationDB = require('./services/databaseService');
require('dotenv').config();

async function testUserRoute() {
  console.log('=== Testing User\'s Specific Route ===');
  
  // The exact route from the user's logs
  const start = { lat: 57.7343942, lng: 12.0442401 };
  const end = { lat: 59.3327036, lng: 18.0656255 };
  
  // Get stations from database
  let stations = [];
  try {
    const db = new ChargingStationDB();
    
    const bufferDegrees = 0.3;
    const north = Math.max(start.lat, end.lat) + bufferDegrees;
    const south = Math.min(start.lat, end.lat) - bufferDegrees;
    const east = Math.max(start.lng, end.lng) + bufferDegrees;
    const west = Math.min(start.lng, end.lng) - bufferDegrees;
    
    stations = db.getStationsInBounds(north, south, east, west, 5000);
    console.log(`Found ${stations.length} stations for user's route`);
    
    db.close();
  } catch (error) {
    console.error('Database error:', error);
    return;
  }
  
  console.log('\n--- User\'s Route: 200km range, 320km capacity ---');
  console.log(`Start: ${start.lat}, ${start.lng}`);
  console.log(`End: ${end.lat}, ${end.lng}`);
  console.log('Expected: Multiple charging stops');
  
  try {
    const result = await findRecommendedChargingStation(
      start, 
      end, 
      200,  // Battery range from user's logs
      320,  // Battery capacity from user's logs
      stations, 
      process.env.GOOGLE_MAPS_API_KEY
    );
    
    console.log('\nResult:');
    console.log(`- Success: ${result.success}`);
    console.log(`- Needs charging: ${result.needsCharging}`);
    console.log(`- Total distance: ${result.totalDistance}km`);
    console.log(`- Scenario: ${result.scenario}`);
    
    if (result.chargingStops && result.chargingStops.length > 0) {
      console.log(`- Charging stops: ${result.chargingStops.length} (should be > 1)`);
      result.chargingStops.forEach((stop, i) => {
        console.log(`  ${i + 1}. ${stop.title} at ${stop.routeKm?.toFixed(1)}km`);
      });
      
      if (result.chargingStops.length === 1) {
        console.log('\n❌ ISSUE: Only 1 stop planned, should be multiple!');
      } else {
        console.log('\n✅ FIXED: Multiple stops planned correctly!');
      }
    } else {
      console.log('- No charging stops planned');
    }
    
    if (result.warning) {
      console.log(`- Warning: ${result.warning}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testUserRoute().catch(console.error);