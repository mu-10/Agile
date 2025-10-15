// Test script to call the backend API and check data structure
const fetch = require('node-fetch');

async function testInfoWindowData() {
  console.log('=== Testing InfoWindow Data Structure ===');
  
  try {
    const response = await fetch('http://localhost:4000/api/find-charging-stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startLat: 57.7343942,
        startLng: 12.0442401,
        endLat: 59.3327036,
        endLng: 18.0656255,
        batteryRange: 200,
        batteryCapacity: 320
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    console.log('Backend Response Structure:');
    console.log('- needsCharging:', data.needsCharging);
    console.log('- chargingStops count:', data.chargingStops ? data.chargingStops.length : 0);
    
    if (data.chargingStops && data.chargingStops.length > 0) {
      console.log('\nFirst Charging Stop Data Structure:');
      const firstStop = data.chargingStops[0];
      console.log('Available properties:', Object.keys(firstStop));
      
      console.log('\nProperty Values:');
      console.log('- id:', firstStop.id);
      console.log('- title:', firstStop.title);
      console.log('- latitude:', firstStop.latitude);
      console.log('- longitude:', firstStop.longitude);
      console.log('- address:', firstStop.address);
      console.log('- town:', firstStop.town);
      console.log('- state:', firstStop.state);
      console.log('- operator:', firstStop.operator);
      console.log('- numberOfPoints:', firstStop.numberOfPoints);
      console.log('- connections:', firstStop.connections ? 'Array with ' + firstStop.connections.length + ' items' : 'null/undefined');
      console.log('- routeKm:', firstStop.routeKm);
      console.log('- routeDeviationKm:', firstStop.routeDeviationKm);
      
      if (firstStop.connections && firstStop.connections.length > 0) {
        console.log('\nFirst Connection Structure:');
        const firstConn = firstStop.connections[0];
        console.log('Connection properties:', Object.keys(firstConn));
        console.log('- type:', firstConn.type);
        console.log('- powerKW:', firstConn.powerKW);
        console.log('- level:', firstConn.level);
        console.log('- quantity:', firstConn.quantity);
      }
      
      console.log('\nSecond Charging Stop (if exists):');
      if (data.chargingStops[1]) {
        const secondStop = data.chargingStops[1];
        console.log('- title:', secondStop.title);
        console.log('- routeKm:', secondStop.routeKm);
        console.log('- routeDeviationKm:', secondStop.routeDeviationKm);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testInfoWindowData().catch(console.error);