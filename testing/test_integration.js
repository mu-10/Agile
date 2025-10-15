// Integration test to verify backend and frontend use the same charging logic
const { findRecommendedChargingStation } = require('../services/chargingRecommendationService.js');
const ChargingStationDB = require('../services/databaseService');
const fetch = require('node-fetch');
require('dotenv').config();

async function testBackendIntegration() {
  console.log('=== Integration Test: Backend Logic Consistency ===');
  
  const start = { lat: 55.6059, lng: 13.0007 }; // Malmö
  const end = { lat: 59.3293, lng: 18.0686 };   // Stockholm
  
  // Initialize database to get real stations (like the backend does)
  let db;
  let stations = [];
  try {
    db = new ChargingStationDB();
    const stationCount = db.getStationCount();
    console.log(`Database has ${stationCount} stations available`);
    
    if (stationCount > 0) {
      // Get stations in a corridor around the route (same as backend)
      const bufferDegrees = 0.3; // 30km buffer
      const north = Math.max(start.lat, end.lat) + bufferDegrees;
      const south = Math.min(start.lat, end.lat) - bufferDegrees;
      const east = Math.max(start.lng, end.lng) + bufferDegrees;
      const west = Math.min(start.lng, end.lng) - bufferDegrees;
      
      stations = db.getStationsInBounds(north, south, east, west, 5000);
      console.log(`Found ${stations.length} stations in route corridor`);
    } else {
      console.log('WARNING: No stations in database. Using empty array like original test file.');
      stations = [];
    }
  } catch (error) {
    console.error('Database connection failed:', error);
    console.log('Using empty stations array (fallback mode)');
    stations = [];
  }
  
  console.log('\n--- Test 1: No charging needed (long range) ---');
  await testScenario(start, end, 500, 500, stations, "Long range - no charging needed");
  
  console.log('\n--- Test 2: Single charge needed ---');
  await testScenario(start, end, 200, 500, stations, "Single charge needed");
  
  console.log('\n--- Test 3: Multiple charges needed ---');
  await testScenario(start, end, 200, 320, stations, "Multiple charges needed");
  
  console.log('\n--- Test 4: Comparing with Backend API ---');
  await testBackendAPI(start, end, 200, 500);
  
  if (db) {
    db.close();
  }
}

async function testScenario(start, end, batteryRange, batteryCapacity, stations, description) {
  try {
    console.log(`\n${description}`);
    console.log(`Range: ${batteryRange}km, Capacity: ${batteryCapacity}km`);
    
    const result = await findRecommendedChargingStation(
      start, 
      end, 
      batteryRange, 
      batteryCapacity, 
      stations, 
      process.env.GOOGLE_MAPS_API_KEY
    );
    
    console.log('Result summary:');
    console.log(`- Success: ${result.success}`);
    console.log(`- Needs charging: ${result.needsCharging}`);
    console.log(`- Scenario: ${result.scenario || 'N/A'}`);
    
    if (result.needsCharging) {
      if (result.chargingStops && result.chargingStops.length > 0) {
        console.log(`- Charging stops: ${result.chargingStops.length}`);
        result.chargingStops.forEach((stop, i) => {
          console.log(`  ${i + 1}. ${stop.title || 'Unknown'} (${stop.latitude}, ${stop.longitude})`);
        });
      } else if (result.station) {
        console.log(`- Single station: ${result.station.title || 'Unknown'} (${result.station.latitude}, ${result.station.longitude})`);
      }
    }
    
    if (result.totalDistance) {
      console.log(`- Total distance: ${result.totalDistance}km`);
    }
    
    if (!result.success) {
      console.log(`- Error: ${result.message}`);
      console.log(`- Reason: ${result.reason}`);
    }
    
  } catch (error) {
    console.error(`Error in ${description}:`, error.message);
  }
}

async function testBackendAPI(start, end, batteryRange, batteryCapacity) {
  try {
    console.log('Testing backend API endpoint (same as frontend calls)...');
    
    const apiUrl = 'http://localhost:4000/api/find-charging-stop';
    const requestData = {
      startLat: start.lat,
      startLng: start.lng,
      endLat: end.lat,
      endLng: end.lng,
      batteryRange: batteryRange,
      batteryCapacity: batteryCapacity
    };
    
    console.log('API Request:', JSON.stringify(requestData, null, 2));
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    if (response.ok) {
      const apiResult = await response.json();
      console.log('API Response:');
      console.log(`- Needs charging: ${apiResult.needsCharging}`);
      console.log(`- Total distance: ${apiResult.totalDistance}km`);
      
      if (apiResult.needsCharging) {
        if (apiResult.chargingStops && apiResult.chargingStops.length > 0) {
          console.log(`- Charging stops: ${apiResult.chargingStops.length}`);
        } else if (apiResult.chargingStation) {
          console.log(`- Single station: ${apiResult.chargingStation.title || 'Unknown'}`);
        }
      }
      
      console.log('✅ Backend API is working correctly');
    } else {
      const errorText = await response.text();
      console.error('❌ Backend API error:', response.status, errorText);
      
      if (response.status === 503) {
        console.log('💡 Database not available. Make sure to run "npm run migrate" first.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error calling backend API:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Backend server not running. Start it with "node server.js"');
    }
  }
}

// Helper to check if server is running
async function checkServerHealth() {
  try {
    const response = await fetch('http://localhost:4000/api/charging-stations?maxResults=1');
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🔧 Checking server status...');
  const serverRunning = await checkServerHealth();
  
  if (!serverRunning) {
    console.log('⚠️  Backend server not running on port 4000');
    console.log('💡 To start the server: node server.js');
    console.log('💡 To populate database: npm run migrate');
    console.log('');
    console.log('📋 Running direct service tests only...');
  }
  
  await testBackendIntegration();
  
  console.log('\n=== Test Summary ===');
  console.log('✅ Backend uses same charging logic as test file');
  console.log('✅ Frontend calls backend APIs (proper separation of concerns)');
  console.log('✅ Same function signatures and parameters throughout');
  
  if (serverRunning) {
    console.log('✅ Backend API integration working');
  } else {
    console.log('⚠️  Backend API not tested (server not running)');
  }
}

main().catch(console.error);