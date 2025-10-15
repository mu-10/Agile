// Test the actual API endpoint to ensure it matches our improved algorithm
const fetch = require('node-fetch');

async function testApiEndpoint() {
  console.log('Testing /api/find-charging-stop endpoint...');
  
  const testParams = {
    startLat: 57.7344492,  // Göteborg
    startLng: 12.0451919,
    endLat: 59.3327036,    // Stockholm  
    endLng: 18.0656255,
    batteryRange: 160,     // 50% of 320km = 160km current range  
    batteryCapacity: 400   // Updated from 320km to 400km to match frontend
  };
  
  try {
    const response = await fetch('http://localhost:4000/api/find-charging-stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP error! status: ${response.status} - ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log('\n=== API ENDPOINT RESULT ===');
    console.log(`needsCharging: ${data.needsCharging}`);
    if (data.needsCharging) {
      console.log(`Number of charging stops: ${data.chargingStops?.length || (data.chargingStation ? 1 : 0)}`);
      if (data.chargingStation) {
        console.log(`Primary station: ${data.chargingStation.title || 'Unknown'} at ${data.chargingStation.routeKm?.toFixed(1) || 'N/A'}km along route`);
      }
      if (data.chargingStops && data.chargingStops.length > 1) {
        data.chargingStops.forEach((stop, i) => {
          console.log(`  Stop ${i + 1}: ${stop.title || 'Unknown'} - ${stop.routeKm?.toFixed(1) || 'N/A'}km along route`);
        });
      }
    }
    console.log(`Total distance: ${data.totalDistance}km`);
    console.log(`Estimated time: ${data.estimatedTime}min`);
    console.log(`Scenario: ${data.scenario || 'Unknown'}`);
    
    if (data.message) {
      console.log(`Message: ${data.message}`);
    }
    
  } catch (error) {
    console.error('Error testing API endpoint:', error);
  }
}

testApiEndpoint();