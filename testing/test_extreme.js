// Test script for extreme charging scenarios
const { findRecommendedChargingStation } = require('../services/chargingRecommendationService.js');
const ChargingStationDB = require('../services/databaseService');
require('dotenv').config();

async function testExtremeScenarios() {
  console.log('=== Testing Extreme Charging Scenarios ===');
  
  // Get real stations from database
  let stations = [];
  try {
    const db = new ChargingStationDB();
    
    // Longer route: Malmö to very north of Sweden
    const start = { lat: 55.6059, lng: 13.0007 }; // Malmö
    const end = { lat: 67.8558, lng: 20.2253 };   // Kiruna (very north)
    
    const bufferDegrees = 0.5; // Larger buffer for longer route
    const north = Math.max(start.lat, end.lat) + bufferDegrees;
    const south = Math.min(start.lat, end.lat) - bufferDegrees;
    const east = Math.max(start.lng, end.lng) + bufferDegrees;
    const west = Math.min(start.lng, end.lng) - bufferDegrees;
    
    stations = db.getStationsInBounds(north, south, east, west, 10000);
    console.log(`Found ${stations.length} stations for long route test`);
    
    db.close();
  } catch (error) {
    console.error('Database error:', error);
    return;
  }
  
  const start = { lat: 55.6059, lng: 13.0007 }; // Malmö
  const end = { lat: 67.8558, lng: 20.2253 };   // Kiruna
  
  console.log('\n--- Extreme Test: Very long route with small battery ---');
  console.log('Route: Malmö to Kiruna (1400+ km)');
  console.log('Battery: 150km range, 200km capacity');
  
  try {
    const result = await findRecommendedChargingStation(
      start, 
      end, 
      150,  // Very short range
      200,  // Small capacity
      stations, 
      process.env.GOOGLE_MAPS_API_KEY
    );
    
    console.log('\nResult:');
    console.log(`- Success: ${result.success}`);
    console.log(`- Needs charging: ${result.needsCharging}`);
    console.log(`- Total distance: ${result.totalDistance}km`);
    
    if (result.success && result.chargingStops) {
      console.log(`- Charging stops planned: ${result.chargingStops.length}`);
      result.chargingStops.forEach((stop, i) => {
        console.log(`  ${i + 1}. ${stop.title} at ${stop.routeKm?.toFixed(1)}km`);
      });
    } else if (!result.success) {
      console.log(`- Error: ${result.message}`);
      console.log(`- Reason: ${result.reason}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testExtremeScenarios().catch(console.error);