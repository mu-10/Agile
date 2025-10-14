// Recommended Charging Station Logic
const fetch = require("node-fetch");

// Helper function to calculate straight line distance between two points
function calculateStraightLineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180)    // Sort by efficiency score (highest first)
  const sortedStations = scoredStations
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore) // Higher score is better
    .slice(0, 10); // Return top 10 stations

  console.log('=== STATION RANKING ===');
  sortedStations.forEach((station, index) => {
    console.log(`${index + 1}. ${station.title || 'Unknown'} - Score: ${station.efficiencyScore} - Distance: ${station.distanceFromStart}km`);
  });

  return sortedStations;}

// Distance cache to avoid duplicate API calls
const distanceCache = new Map();

// Clear cache function for debugging
function clearDistanceCache() {
  distanceCache.clear();
  console.log('Distance cache cleared');
}

// Function to calculate road distance using Google Directions API
async function calculateDistance(lat1, lon1, lat2, lon2, googleMapsApiKey) {
  // Use env variable if not provided
  if (!googleMapsApiKey) {
    googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
      console.warn('No Google Maps API key provided or found in environment.');
    }
  }

  // Create cache key
  const cacheKey = `${lat1.toFixed(6)},${lon1.toFixed(6)}-${lat2.toFixed(6)},${lon2.toFixed(6)}`;

  // Check cache first
  if (distanceCache.has(cacheKey)) {
    return distanceCache.get(cacheKey);
  }

  try {
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lon1}&destination=${lat2},${lon2}&mode=driving&alternatives=false&key=${googleMapsApiKey}`;

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(directRouteUrl, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const roadDistance = data.routes[0].legs[0].distance.value / 1000; // Convert to km
      distanceCache.set(cacheKey, roadDistance);
      return roadDistance;
    } else {
      // Fallback to straight-line distance
      const straightDistance = calculateStraightLineDistance(lat1, lon1, lat2, lon2);
      distanceCache.set(cacheKey, straightDistance);
      return straightDistance;
    }
  } catch (error) {
    // Fallback to straight-line distance on error
    const straightDistance = calculateStraightLineDistance(lat1, lon1, lat2, lon2);
    distanceCache.set(cacheKey, straightDistance);
    return straightDistance;
  }
}

// Calculate actual route distance using Google Directions API
async function calculateActualRouteDistance(start, end, googleMapsApiKey) {
  try {
    
  if (!googleMapsApiKey) {
    console.warn('No Google Maps API key provided or found in environment.');
    return {
      distance: calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng),
      avgSpeed: 80, // fallback speed
      routeGeometry: null
    };
  }
    

    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&mode=driving&alternatives=false&key=${googleMapsApiKey}`;
    
    console.log('Backend routing URL:', directRouteUrl);
    const directRouteResponse = await fetch(directRouteUrl);
    const directRouteData = await directRouteResponse.json();
    console.log('Backend routing response:', directRouteData.status, directRouteData.routes?.[0]?.legs?.[0]?.distance);
    
    if (directRouteData.status !== 'OK' || !directRouteData.routes.length) {
      return {
        distance: calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng),
        avgSpeed: 80,
        routeGeometry: null
      };
    }
    
    const route = directRouteData.routes[0];
    const totalDistance = route.legs[0].distance.value / 1000; // Convert to km
    const totalDuration = route.legs[0].duration.value / 3600; // Convert to hours
    const avgSpeed = totalDistance / totalDuration;
    
    return {
      distance: totalDistance,
      avgSpeed: avgSpeed,
      routeGeometry: route.overview_polyline.points,
      routeSteps: route.legs[0].steps
    };
  } catch (error) {
    return {
      distance: calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng),
      avgSpeed: 80,
      routeGeometry: null
    };
  }
}

// Calculate actual detour by comparing route with charging stop vs original route
async function calculateActualDetour(start, end, station, originalRouteDistance, googleMapsApiKey) {
  try {
    // Use env variable if not provided
    if (!googleMapsApiKey) {
      googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    }

    // Calculate route: start -> station -> end (with charging stop)
    const routeWithChargingUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&waypoints=${station.latitude},${station.longitude}&mode=driving&alternatives=false&key=${googleMapsApiKey}`;

    const response = await fetch(routeWithChargingUrl);
    const data = await response.json();
    
    if (data.status === 'OK' && data.routes.length > 0) {
      const route = data.routes[0];
      let totalDistanceWithCharging = 0;
      let totalDurationWithCharging = 0;
      
      // Sum up all legs (start->station, station->end)
      route.legs.forEach(leg => {
        totalDistanceWithCharging += leg.distance.value / 1000; // Convert to km
        totalDurationWithCharging += leg.duration.value / 60; // Convert to minutes
      });
      
      const actualDetour = totalDistanceWithCharging - originalRouteDistance;
      
      return {
        success: true,
        totalDistanceWithCharging: totalDistanceWithCharging,
        actualDetour: actualDetour,
        travelTimeWithCharging: totalDurationWithCharging
      };
    } else {
      // Fallback to simple calculation if routing fails
      const distanceToStation = await calculateDistance(start.lat, start.lng, station.latitude, station.longitude, googleMapsApiKey);
      const distanceFromStation = await calculateDistance(station.latitude, station.longitude, end.lat, end.lng, googleMapsApiKey);
      const totalWithCharging = distanceToStation + distanceFromStation;
      
      return {
        success: false,
        totalDistanceWithCharging: totalWithCharging,
        actualDetour: totalWithCharging - originalRouteDistance,
        travelTimeWithCharging: null
      };
    }
  } catch (error) {
    
    // Fallback calculation
    const distanceToStation = await calculateDistance(start.lat, start.lng, station.latitude, station.longitude, googleMapsApiKey);
    const distanceFromStation = await calculateDistance(station.latitude, station.longitude, end.lat, end.lng, googleMapsApiKey);
    const totalWithCharging = distanceToStation + distanceFromStation;
    
    return {
      success: false,
      totalDistanceWithCharging: totalWithCharging,
      actualDetour: totalWithCharging - originalRouteDistance,
      travelTimeWithCharging: null
    };
  }
}

// Function to calculate charging waypoint using actual route geometry from Google Maps
async function calculateChargingWaypoint(start, end, totalDistance, batteryRange, batteryCapacity, googleMapsApiKey) {
  // Target charging when we have 20% battery remaining (80% of current battery range used)
  // But ensure we can reach destination after charging to 80% of full capacity
  const currentRange = parseFloat(batteryRange);
  const maxCapacity = parseFloat(batteryCapacity);
  const rangeAfterCharging = maxCapacity * 0.8;
  
  console.log(`Charging waypoint calculation:`);
  console.log(`Current range: ${currentRange} km`);
  console.log(`Max capacity: ${maxCapacity} km`);
  console.log(`Range after charging to 80%: ${rangeAfterCharging} km`);
  
  // If even after charging we can't reach destination, we need multiple charging stops
  if (rangeAfterCharging < totalDistance) {
    console.log(`WARNING: Even after charging (${rangeAfterCharging}km), cannot reach destination (${totalDistance}km). Need multiple charging stops!`);
    
    // For now, position charging station so we can go as far as possible after charging
    // Charge at: totalDistance - rangeAfterCharging (so after charging we can reach the end)
    const optimalChargingPoint = Math.max(totalDistance - rangeAfterCharging, currentRange * 0.8);
    console.log(`Optimal charging point for this scenario: ${optimalChargingPoint} km from start`);
    
    const targetDistanceFromStart = Math.min(optimalChargingPoint, currentRange * 0.9); // Don't go beyond 90% of current range
    console.log(`Using charging point: ${targetDistanceFromStart} km from start`);
    
    return await findWaypointAtDistance(start, end, totalDistance, targetDistanceFromStart, googleMapsApiKey);
  }
  
  // Normal case: charge when we have used 80% of current battery (20% remaining)  
  const targetDistanceFromStart = currentRange * 0.8;
  console.log(`Normal charging scenario - target distance: ${targetDistanceFromStart} km from start`);

  return await findWaypointAtDistance(start, end, totalDistance, targetDistanceFromStart, googleMapsApiKey);
}

// Helper function to find waypoint at specific distance along route
async function findWaypointAtDistance(start, end, totalDistance, targetDistanceFromStart, googleMapsApiKey) {
  try {
    // Get the actual route from Google Directions API
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&mode=driving&alternatives=false&key=${googleMapsApiKey}`;
    const response = await fetch(directRouteUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const route = data.routes[0];
      const routeSteps = route.legs[0].steps;
      // Find the point along the actual route path at target distance
      let accumulatedDistance = 0;

      for (let i = 0; i < routeSteps.length; i++) {
        const step = routeSteps[i];
        const stepDistance = step.distance.value / 1000; // Convert to km

        if (accumulatedDistance + stepDistance >= targetDistanceFromStart) {
          // The target point is the start of this step (actual location on route)
          const stepStart = step.start_location;
          return {
            lat: stepStart.lat,
            lng: stepStart.lng,
            distanceFromStart: accumulatedDistance,
            distanceToEnd: totalDistance - accumulatedDistance,
            routeGeometry: route.overview_polyline.points, // Store route for detour calculations
            routeSteps: routeSteps
          };
        }

        accumulatedDistance += stepDistance;
      }
      // If not found, use last step's end location
      const lastStep = routeSteps[routeSteps.length - 1];
      return {
        lat: lastStep.end_location.lat,
        lng: lastStep.end_location.lng,
        distanceFromStart: totalDistance,
        distanceToEnd: 0,
        routeGeometry: route.overview_polyline.points,
        routeSteps: routeSteps
      };
    }
  } catch (error) {
    // Fallback to linear interpolation if API fails
    const progressRatio = Math.min(targetDistanceFromStart / totalDistance, 0.9);
    const targetLat = start.lat + (end.lat - start.lat) * progressRatio;
    const targetLng = start.lng + (end.lng - start.lng) * progressRatio;

    return {
      lat: targetLat,
      lng: targetLng,
      distanceFromStart: targetDistanceFromStart,
      distanceToEnd: totalDistance - targetDistanceFromStart,
      routeGeometry: null // No route geometry available
    };
  }
}

// Helper function to get maximum charging power from connector data
function getMaxChargingPower(station) {
  let maxPower = 0;
  
  // Check each connector type for maximum power
  const connectorTypes = [
    'ccs_power', 'chademo_power', 'type2_power', 
    'tesla_power', 'type1_power', 'mennekes_power'
  ];
  
  connectorTypes.forEach(connectorType => {
    if (station[connectorType] && station[connectorType] > maxPower) {
      maxPower = station[connectorType];
    }
  });
  
  return maxPower || 50; // Default to 50kW if no power info available
}

// Helper function to estimate charging time
function estimateChargingTime(powerKW, batteryCapacity) {
  // Estimate charging from 20% to 80% (60% of battery)
  const chargeAmount = parseFloat(batteryCapacity) * 0.6;
  
  // Charging efficiency decreases at higher power, estimate 85% efficiency
  const effectivePower = powerKW * 0.85;
  
  return chargeAmount / effectivePower; // Hours
}

// Function to filter viable stations near charging waypoint
async function filterViableStations(allStations, start, end, chargingWaypoint, batteryRange, batteryCapacity, googleMapsApiKey) {
  let filteredByDestinationReach = 0;
  
  // Walk the route from the start, check for stations within 2km of each route step
    const debugFiltered = { missingLatLng: 0, notOperational: 0, tooFar: 0 };
  let routeSteps = [];
  if (chargingWaypoint && chargingWaypoint.routeSteps) {
    routeSteps = chargingWaypoint.routeSteps;
  }


    const viableStations = [];
    if (chargingWaypoint && chargingWaypoint.routeSteps && chargingWaypoint.routeSteps.length > 0) {
      let foundCount = 0;
      const foundStationIds = new Set();
      const preferredIndex = chargingWaypoint.preferredIndex !== undefined ? chargingWaypoint.preferredIndex : chargingWaypoint.routeSteps.length - 1;
      for (let i = preferredIndex; i >= 0; i--) {
        const step = chargingWaypoint.routeSteps[i];
        const stepLat = step.start_location.lat;
        const stepLng = step.start_location.lng;
        // Filter stations within 2km straight-line from this step
        const stationsToCheck = allStations.filter(station => {
          if (!station.latitude || !station.longitude) return false;
          if (station.status && station.status.toLowerCase() !== 'operational') return false;
          const straightLine = calculateStraightLineDistance(stepLat, stepLng, station.latitude, station.longitude);
          return straightLine <= 2;
        });
        console.log(`Checking ${stationsToCheck.length} stations near route step at ${stepLat.toFixed(4)}, ${stepLng.toFixed(4)}`);
        for (const station of stationsToCheck) {
          // Use unique station ID or lat/lng as cache key
          const stationId = station.id || `${station.latitude},${station.longitude}`;
          if (foundStationIds.has(stationId)) continue;
          // Use Google API to check actual route distance from step to station
          const routeDistanceToStation = await calculateDistance(stepLat, stepLng, station.latitude, station.longitude, googleMapsApiKey);
          // Reachability check: can you reach the station from start with current battery?
          const routeDistanceFromStart = await calculateDistance(start.lat, start.lng, station.latitude, station.longitude, googleMapsApiKey);
          const buffer = 10; // km safety buffer
          const currentBatteryRange = parseFloat(batteryRange);
          console.log(`Station at ${routeDistanceFromStart.toFixed(1)}km from start - can reach? ${routeDistanceFromStart <= currentBatteryRange - buffer} (need < ${currentBatteryRange - buffer}km)`);
          if (routeDistanceToStation <= 2 && routeDistanceFromStart <= currentBatteryRange - buffer) {
            station.roadDistanceFromStart = routeDistanceFromStart;
            station.roadDistanceToEnd = await calculateDistance(station.latitude, station.longitude, end.lat, end.lng, googleMapsApiKey);
              station.batteryRemainingAtStation = 100 - ((routeDistanceFromStart / parseFloat(batteryCapacity)) * 100);
            console.log(`✅ Added viable station: ${station.title || 'Unknown'} at ${routeDistanceFromStart.toFixed(1)}km from start`);
            viableStations.push(station);
            foundStationIds.add(stationId);
            foundCount++;
          } else {
            debugFiltered.tooFar++;
          }
          if (foundCount >= 5) break;
        }
        if (foundCount >= 5) break;
      }
      console.log(`Total viable stations found: ${viableStations.length}`);
      return viableStations;
    }
    console.log(`No route steps available, returning empty viable stations list`);
    return viableStations;
}

// Function to score and rank charging stations with accurate detour calculations
async function scoreAndRankStations(viableStations, start, end, totalDistance, batteryRange, batteryCapacity, optimalChargingDistance, googleMapsApiKey) {
  const scoredStations = [];
  
  for (const station of viableStations) {
    const distanceFromStart = station.roadDistanceFromStart;
    const distanceToEnd = station.roadDistanceToEnd;
    
    // Calculate ACTUAL detour using real routing with waypoint
    const detourCalculation = await calculateActualDetour(start, end, station, totalDistance, googleMapsApiKey);
    const actualDetour = detourCalculation.actualDetour;
    const totalDistanceViaStation = detourCalculation.totalDistanceWithCharging;
    
    // Get charging specifications
    const maxPowerKW = getMaxChargingPower(station);
    const chargingTimeHours = estimateChargingTime(maxPowerKW, parseFloat(batteryCapacity));
    const chargingTimeMinutes = chargingTimeHours * 60;

    // Calculate final efficiency score (higher is better)
    // Use the optimal charging distance calculated earlier (180km for our case)
    const targetDistance = optimalChargingDistance; 
    const distanceFromTarget = Math.abs(distanceFromStart - targetDistance);
    console.log(`Station ${station.title || 'Unknown'} at ${distanceFromStart.toFixed(1)}km - distance from optimal (${targetDistance.toFixed(1)}km): ${distanceFromTarget.toFixed(1)}km`);
  const batteryRemainingAtStation = ((parseFloat(batteryCapacity) - distanceFromStart) / parseFloat(batteryCapacity)) * 100;
    
    // Scoring system that heavily prioritizes minimal detour
    const efficiencyScore =
      1000 - // Base positive score
      (Math.abs(actualDetour) * 200) - // EXTREMELY HEAVY penalty for actual detour
      (chargingTimeMinutes * 0.2) - // Charging time penalty
      (distanceFromTarget * 0.5) + // Small penalty for being far from ideal charging point
      (batteryRemainingAtStation > 30 && Math.abs(actualDetour) < 3 ? 100 : 0) + // HUGE bonus for high battery + minimal detour
      (batteryRemainingAtStation > 40 && Math.abs(actualDetour) < 1 ? 50 : 0) + // Extra bonus for very high battery + tiny detour  
      ((station.numberOfPoints || 1) * 2) + // Small bonus for more charging points
      (maxPowerKW > 100 ? 15 : 0) + // Bonus for fast charging
      (maxPowerKW > 200 ? 10 : 0); // Extra bonus for ultra-fast charging

    // After charging, set battery range to batteryCapacity * 0.8 for the trip to destination
    const postChargeRange = parseFloat(batteryCapacity) * 0.8;
    scoredStations.push({
      ...station,
      distanceFromStart: Math.round(distanceFromStart * 10) / 10,
      distanceToEnd: Math.round(distanceToEnd * 10) / 10,
      totalDistanceViaStation: Math.round(totalDistanceViaStation * 10) / 10,
      actualDetour: Math.round(actualDetour * 10) / 10, // Use actual detour instead of simple calculation
      batteryRemainingAtStation: Math.round(batteryRemainingAtStation * 10) / 10,
      maxPowerKW,
      estimatedChargingTimeMinutes: Math.round(chargingTimeMinutes),
      efficiencyScore: Math.round(efficiencyScore * 10) / 10,
      remainingRangeAtDestination: Math.round((postChargeRange - distanceToEnd) * 10) / 10,
      batteryPercentAtArrival: Math.round(((parseFloat(batteryCapacity) - distanceFromStart) / parseFloat(batteryCapacity)) * 100),
      routingSuccess: detourCalculation.success
    });
  }

  // Sort by efficiency score (highest first)
  const sortedStations = scoredStations
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore) // Higher score is better
    .slice(0, 10); // Return top 10 stations

  return sortedStations;
}

// Main function to find recommended charging station with new charging logic
async function findRecommendedChargingStation(start, end, batteryRange, batteryCapacity, allStations, googleMapsApiKey) {
  try {
    // Step 1: Calculate the full route distance using Google Maps API
    const routeData = await calculateActualRouteDistance(start, end, googleMapsApiKey);
    const totalDistance = routeData.distance;
    
    // Clear cache for debugging
    clearDistanceCache();
    console.log(`=== NEW CHARGING LOGIC ===`);
    console.log(`Route: ${start.lat},${start.lng} -> ${end.lat},${end.lng}`);
    console.log(`Total Distance: ${totalDistance} km`);
    console.log(`Current Battery Range: ${batteryRange} km`);
    console.log(`Maximum Battery Capacity: ${batteryCapacity} km`);

    const currentRange = parseFloat(batteryRange);
    const maxRange = parseFloat(batteryCapacity);
    
    // Step 2: Check current range vs. distance
    console.log(`\n--- STEP 1: Check Current Range vs Distance ---`);
    console.log(`Current range (${currentRange}) >= Total distance (${totalDistance})? ${currentRange >= totalDistance}`);
    
    if (currentRange >= totalDistance) {
      console.log(`✅ NO CHARGING NEEDED - Current range sufficient`);
      const rangeAtArrival = currentRange - totalDistance;
      const percentAtArrival = (rangeAtArrival / maxRange) * 100;

      return {
        success: true,
        needsCharging: false,
        message: "No charging needed - trip is within current vehicle range",
        totalDistance: Number(Math.round(totalDistance * 10) / 10),
        estimatedTime: routeData.duration,
        rangeAtArrival: Number(Math.round(rangeAtArrival * 10) / 10),
        percentAtArrival: Number(Math.round(percentAtArrival * 10) / 10),
        chargingStops: []
      };
    }
    
    console.log(`❌ CHARGING NEEDED - Current range insufficient`);
    
    // Step 3: Evaluate maximum range
    console.log(`\n--- STEP 2: Evaluate Maximum Range ---`);
    console.log(`Maximum range (${maxRange}) >= Total distance (${totalDistance})? ${maxRange >= totalDistance}`);
    
    if (maxRange >= totalDistance) {
      console.log(`✅ SINGLE CHARGE SUFFICIENT - Only one charge needed near start`);
      return await handleSingleChargeScenario(start, end, totalDistance, currentRange, maxRange, allStations, googleMapsApiKey);
    } else {
      console.log(`❌ MULTIPLE CHARGES NEEDED - Maximum range insufficient for total distance`);
      return await handleMultipleChargeScenario(start, end, totalDistance, currentRange, maxRange, allStations, googleMapsApiKey);
    }
    
  } catch (error) {
    console.error(`Error in charging logic: ${error.message}`);
    return {
      success: false,
      message: `Error finding charging stations: ${error.message}`
    };
  }
}

// Handle single charge scenario (max range >= total distance)
async function handleSingleChargeScenario(start, end, totalDistance, currentRange, maxRange, allStations, googleMapsApiKey) {
  console.log(`\n--- SINGLE CHARGE SCENARIO ---`);
  console.log(`Strategy: Charge once near starting location to ensure trip completion`);
  
  // Find stations near the start that we can reach with current battery
  const reachableDistance = currentRange * 0.8; // Use 80% of current range as safety margin
  console.log(`Looking for stations within ${reachableDistance}km of start`);
  
  const nearbyStations = [];
  
  for (const station of allStations) {
    if (!station.latitude || !station.longitude) continue;
    if (station.status && station.status.toLowerCase() !== 'operational') continue;
    
    const distanceFromStart = await calculateDistance(start.lat, start.lng, station.latitude, station.longitude, googleMapsApiKey);
    
    if (distanceFromStart <= reachableDistance) {
      // Check if charging to 80% would be sufficient for the trip
      const rangeAfterCharging = maxRange * 0.8;
      const distanceToEnd = await calculateDistance(station.latitude, station.longitude, end.lat, end.lng, googleMapsApiKey);
      
      if (rangeAfterCharging >= distanceToEnd) {
        nearbyStations.push({
          ...station,
          distanceFromStart: distanceFromStart,
          distanceToEnd: distanceToEnd,
          rangeAfterCharging: rangeAfterCharging,
          rangeAtDestination: rangeAfterCharging - distanceToEnd
        });
      }
    }
  }
  
  if (nearbyStations.length === 0) {
    return {
      success: false,
      message: "No suitable charging stations found near starting location"
    };
  }
  
  // Sort by distance from start (prefer closer stations)
  nearbyStations.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
  const bestStation = nearbyStations[0];
  
  console.log(`✅ Selected station: ${bestStation.title || 'Unknown'} at ${bestStation.distanceFromStart.toFixed(1)}km from start`);
  console.log(`After charging to 80%: ${bestStation.rangeAfterCharging}km range, ${bestStation.rangeAtDestination.toFixed(1)}km remaining at destination`);
  
  return {
    success: true,
    needsCharging: true,
    message: `Single charge needed: ${bestStation.title || 'Unknown'}`,
    totalDistance: Math.round(totalDistance * 10) / 10,
    chargingStops: [bestStation],
    station: bestStation, // For backward compatibility
    scenario: 'single_charge'
  };
}

// Handle multiple charge scenario (max range < total distance)
async function handleMultipleChargeScenario(start, end, totalDistance, currentRange, maxRange, allStations, googleMapsApiKey) {
  console.log(`\n--- MULTIPLE CHARGE SCENARIO ---`);
  console.log(`Strategy: Multiple charges needed - use 80% rule iteratively`);
  
  const chargingStops = [];
  let currentPosition = { lat: start.lat, lng: start.lng };
  let remainingDistance = totalDistance;
  let currentBatteryRange = currentRange;
  let hopNumber = 1;
  
  console.log(`Starting journey with ${currentBatteryRange}km range, ${remainingDistance}km to go`);
  
  while (currentBatteryRange < remainingDistance) {
    console.log(`\n--- HOP ${hopNumber} ---`);
    
    // Calculate how far we can go with current battery (80% of current range)
    const reachableDistance = currentBatteryRange * 0.8;
    console.log(`Can travel ${reachableDistance}km safely with current battery`);
    
    // Find stations within reachable distance
    const reachableStations = [];
    
    for (const station of allStations) {
      if (!station.latitude || !station.longitude) continue;
      if (station.status && station.status.toLowerCase() !== 'operational') continue;
      
      const distanceToStation = await calculateDistance(currentPosition.lat, currentPosition.lng, station.latitude, station.longitude, googleMapsApiKey);
      
      if (distanceToStation <= reachableDistance) {
        reachableStations.push({
          ...station,
          distanceFromCurrentPos: distanceToStation
        });
      }
    }
    
    if (reachableStations.length === 0) {
      return {
        success: false,
        message: `No reachable stations found for hop ${hopNumber}. Journey not possible with current battery technology.`
      };
    }
    
    // Select the station that gets us closest to the destination while still being reachable
    // Sort by distance from current position, prefer stations that are further along the route
    reachableStations.sort((a, b) => b.distanceFromCurrentPos - a.distanceFromCurrentPos);
    const selectedStation = reachableStations[0];
    
    console.log(`Selected station: ${selectedStation.title || 'Unknown'} at ${selectedStation.distanceFromCurrentPos.toFixed(1)}km from current position`);
    
    // Charge to 80% of maximum range
    const rangeAfterCharging = maxRange * 0.8;
    console.log(`Charging to 80% of max capacity: ${rangeAfterCharging}km range`);
    
    // Update position and battery for next iteration
    currentPosition = { lat: selectedStation.latitude, lng: selectedStation.longitude };
    currentBatteryRange = rangeAfterCharging;
    remainingDistance = await calculateDistance(currentPosition.lat, currentPosition.lng, end.lat, end.lng, googleMapsApiKey);
    
    selectedStation.rangeAfterCharging = rangeAfterCharging;
    selectedStation.remainingDistanceAfterCharge = remainingDistance;
    chargingStops.push(selectedStation);
    
    console.log(`After charging: ${rangeAfterCharging}km range, ${remainingDistance.toFixed(1)}km remaining to destination`);
    
    // Check if we can now reach the destination
    if (rangeAfterCharging >= remainingDistance) {
      console.log(`✅ Can now reach destination after this charge`);
      break;
    }
    
    hopNumber++;
    
    // Safety check to prevent infinite loops
    if (hopNumber > 10) {
      return {
        success: false,
        message: "Too many charging stops required. Journey may not be feasible."
      };
    }
  }
  
  console.log(`✅ Journey planned with ${chargingStops.length} charging stop(s)`);
  
  return {
    success: true,
    needsCharging: true,
    message: `Multiple charges needed: ${chargingStops.length} stops`,
    totalDistance: Math.round(totalDistance * 10) / 10,
    chargingStops: chargingStops,
    station: chargingStops[0], // For backward compatibility - return first station
    scenario: 'multiple_charge'
  };
}

module.exports = {
  findRecommendedChargingStation,
  calculateDistance,
  calculateStraightLineDistance,
  calculateActualDetour
};