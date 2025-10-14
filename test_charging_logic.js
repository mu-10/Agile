// Test script for the new charging logic
const { findRecommendedChargingStation } = require('./services/chargingRecommendationService.js');

async function testChargingLogic() {
  const start = { lat: 55.6059, lng: 13.0007 }; // Malmö
  const end = { lat: 59.3293, lng: 18.0686 };   // Stockholm
  
  console.log('=== Testing New Charging Logic ===');
  
  // Test 1: Current range sufficient (no charging needed)
  console.log('\n--- Test 1: Current range sufficient ---');
  try {
    const result1 = await findRecommendedChargingStation(
      start, end, 500, 500, [], process.env.GOOGLE_MAPS_API_KEY
    );
    console.log('Result 1:', JSON.stringify(result1, null, 2));
  } catch (error) {
    console.error('Error in test 1:', error.message);
  }
  
  // Test 2: Single charge needed
  console.log('\n--- Test 2: Single charge needed ---');
  try {
    const result2 = await findRecommendedChargingStation(
      start, end, 200, 500, [], process.env.GOOGLE_MAPS_API_KEY
    );
    console.log('Result 2:', JSON.stringify(result2, null, 2));
  } catch (error) {
    console.error('Error in test 2:', error.message);
  }
  
  // Test 3: Multiple charges needed
  console.log('\n--- Test 3: Multiple charges needed ---');
  try {
    const result3 = await findRecommendedChargingStation(
      start, end, 200, 320, [], process.env.GOOGLE_MAPS_API_KEY
    );
    console.log('Result 3:', JSON.stringify(result3, null, 2));
  } catch (error) {
    console.error('Error in test 3:', error.message);
  }
}

testChargingLogic().catch(console.error);