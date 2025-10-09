// Recommended Charging Station Logic
// This module contains all the logic for finding and scoring optimal charging stations

const fetch = require("node-fetch");

// Helper function to calculate distance between two points
function calculateStraightLineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Distance cache to avoid duplicate API calls
const distanceCache = new Map();

// Function to calculate road distance using Google Directions API
async function calculateDistance(lat1, lon1, lat2, lon2, googleMapsApiKey) {
  // Create cache key
  const cacheKey = `${lat1.toFixed(6)},${lon1.toFixed(6)}-${lat2.toFixed(6)},${lon2.toFixed(6)}`;
  
  // Check cache first
  if (distanceCache.has(cacheKey)) {
    console.log(`📋 Cache hit for distance calculation`);
    return distanceCache.get(cacheKey);
  }

  try {
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lon1}&destination=${lat2},${lon2}&key=${googleMapsApiKey}`;
    console.log(`🌐 Making Google Maps API call for distance calculation...`);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(directRouteUrl, { 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    const data = await response.json();
    console.log(`✅ Google Maps API response received, status: ${data.status}`);
    
    if (data.status === 'OK' && data.routes.length > 0) {
      const roadDistance = data.routes[0].legs[0].distance.value / 1000; // Convert to km
      distanceCache.set(cacheKey, roadDistance);
      return roadDistance;
    } else {
      // Fallback to straight-line distance
      console.log(`⚠️ Google Maps API returned status: ${data.status}, using straight-line distance`);
      const straightDistance = calculateStraightLineDistance(lat1, lon1, lat2, lon2);
      distanceCache.set(cacheKey, straightDistance);
      return straightDistance;
    }
  } catch (error) {
    // Fallback to straight-line distance on error
    console.log(`❌ Google Maps API error (${error.message}), using straight-line distance`);
    const straightDistance = calculateStraightLineDistance(lat1, lon1, lat2, lon2);
    distanceCache.set(cacheKey, straightDistance);
    return straightDistance;
  }
}

// Calculate actual route distance using Google Directions API
async function calculateActualRouteDistance(start, end, googleMapsApiKey) {
  try {
    if (!googleMapsApiKey) {
      return {
        distance: calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng),
        avgSpeed: 80, // fallback speed
        routeGeometry: null
      };
    }
    
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&key=${googleMapsApiKey}`;
    
    const directRouteResponse = await fetch(directRouteUrl);
    const directRouteData = await directRouteResponse.json();
    
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
    // Calculate route: start -> station -> end (with charging stop)
    const routeWithChargingUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&waypoints=${station.latitude},${station.longitude}&key=${googleMapsApiKey}`;
    
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
    console.warn("Error calculating actual detour:", error.message);
    
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
async function calculateChargingWaypoint(start, end, totalDistance, batteryRange, googleMapsApiKey) {
  console.log(`Checking if charging is needed: Route=${totalDistance}km, Range=${batteryRange}km, 85% of range=${parseFloat(batteryRange) * 0.85}km`);
  
  // If trip is shorter than 85% of battery range, no charging needed (15% safety buffer)
  if (totalDistance <= parseFloat(batteryRange) * 0.85) {
    console.log(`No charging needed: ${totalDistance}km <= ${parseFloat(batteryRange) * 0.85}km`);
    return null;
  }
  
  console.log(`Charging IS needed: ${totalDistance}km > ${parseFloat(batteryRange) * 0.85}km`);
  
  // Target charging when we have 25% battery remaining (75% of battery range used)
  const targetDistanceFromStart = parseFloat(batteryRange) * 0.75;
  
  try {
    // Get the actual route from Google Directions API
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&key=${googleMapsApiKey}`;
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
          // The target point is within this step
          const remainingDistance = targetDistanceFromStart - accumulatedDistance;
          const progressInStep = remainingDistance / stepDistance;
          
          // Interpolate between start and end of this step
          const stepStart = step.start_location;
          const stepEnd = step.end_location;
          
          const waypointLat = stepStart.lat + (stepEnd.lat - stepStart.lat) * progressInStep;
          const waypointLng = stepStart.lng + (stepEnd.lng - stepStart.lng) * progressInStep;
          
          return {
            lat: waypointLat,
            lng: waypointLng,
            distanceFromStart: targetDistanceFromStart,
            distanceToEnd: totalDistance - targetDistanceFromStart,
            routeGeometry: route.overview_polyline.points // Store route for detour calculations
          };
        }
        
        accumulatedDistance += stepDistance;
      }
    }
  } catch (error) {
    console.warn("Could not get route geometry, falling back to straight-line waypoint:", error.message);
  }
  
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
function estimateChargingTime(powerKW, batteryCapacityKWh) {
  // Estimate charging from 20% to 80% (60% of battery)
  const chargeAmount = parseFloat(batteryCapacityKWh) * 0.6;
  
  // Charging efficiency decreases at higher power, estimate 85% efficiency
  const effectivePower = powerKW * 0.85;
  
  return chargeAmount / effectivePower; // Hours
}

// Function to filter viable stations near charging waypoint
async function filterViableStations(allStations, start, end, chargingWaypoint, batteryRange, batteryCapacity, googleMapsApiKey) {
  console.log(`🔍 Starting filterViableStations with ${allStations.length} stations`);
  
  let filteredByBasicData = 0;
  let filteredByStatus = 0;
  let filteredByDistance = 0;
  let filteredByDestinationReach = 0;
  
  // First pass: Filter stations near waypoint and calculate preliminary efficiency scores
  const nearbyStations = allStations.filter(station => {
    // Skip stations that don't have basic required data
    if (!station.latitude || !station.longitude) {
      filteredByBasicData++;
      return false;
    }
    
    // Skip stations that are not operational (if status field exists)
    if (station.status && station.status.toLowerCase() !== 'operational') {
      filteredByStatus++;
      return false;
    }
    
    // Calculate straight-line distance from station to target charging waypoint
    const distanceToWaypoint = calculateStraightLineDistance(
      station.latitude, station.longitude,
      chargingWaypoint.lat, chargingWaypoint.lng
    );
    
    // Debug: log the first few stations to see distances
    if (filteredByDistance + filteredByBasicData + filteredByStatus < 10) {
      console.log(`📍 Station "${station.title || station.name || 'Unknown'}" at ${station.latitude},${station.longitude}`);
      console.log(`   Distance to waypoint (${chargingWaypoint.lat.toFixed(4)},${chargingWaypoint.lng.toFixed(4)}): ${distanceToWaypoint.toFixed(2)}km`);
    }
    
    // Increase search radius to 50km since we're now using precise waypoint placement
    if (distanceToWaypoint > 50) {
      filteredByDistance++;
      return false;
    }
    
    // Calculate initial efficiency score using straight-line distances
    const straightLineToEnd = calculateStraightLineDistance(
      station.latitude, station.longitude, 
      end.lat, end.lng
    );
    
    // Quick check: can the station reach the destination with a full charge?
    if (straightLineToEnd * 1.3 > parseFloat(batteryRange) - 20) {
      filteredByDestinationReach++;
      return false;
    }
    
    // SIMPLIFIED: Just store distance to waypoint for sorting
    station._distanceToWaypoint = distanceToWaypoint;
    
    // Debug: log stations near waypoint
    if (distanceToWaypoint < 25) {
      console.log(`   🎯 GOOD STATION: ${station.title || station.name || 'Unknown'} - ${distanceToWaypoint.toFixed(1)}km from waypoint`);
    }
    
    return true;
  });
  
  console.log(`🎯 Found ${nearbyStations.length} stations after initial filtering`);
  
  // SIMPLIFIED: Sort by distance to waypoint (closest first)
  nearbyStations.sort((a, b) => a._distanceToWaypoint - b._distanceToWaypoint);
  
  const maxCandidates = Math.min(nearbyStations.length, 10); // Check top 10 closest stations
  const candidates = nearbyStations.slice(0, maxCandidates);
  
  console.log(`🏆 Selected top ${candidates.length} candidates (closest to waypoint):`);
  candidates.forEach((station, index) => {
    console.log(`   ${index + 1}. ${station.title || station.name || 'Unknown'} - ${station._distanceToWaypoint.toFixed(1)}km from waypoint`);
  });
  
  // Second pass: Use Google Maps API to get precise distances for top candidates
  const viableStations = [];
  
  console.log(`🚗 Starting detailed distance calculations for ${candidates.length} candidates...`);
  
  for (let i = 0; i < candidates.length; i++) {
    const station = candidates[i];
    console.log(`📍 Analyzing station ${i + 1}/${candidates.length}: ${station.title || station.name || 'Unknown'}`);
    
    // Use straight-line distance from start to station (more reliable than Google API for initial filtering)
    const roadDistanceFromStart = calculateStraightLineDistance(start.lat, start.lng, station.latitude, station.longitude);
    
    console.log(`🛣️ Straight-line distance from start to station: ${roadDistanceFromStart}km`);
    
    // Check if this station is reachable (must have at least 20% battery when arriving)
    // Use more conservative estimate: straight-line * 1.3 to account for road routing
    const estimatedRoadDistance = roadDistanceFromStart * 1.3;
    
    // More realistic check: station should be reachable within 70% of battery range (30% safety buffer)
    const maxReachableDistance = parseFloat(batteryRange) * 0.70;
    
    if (estimatedRoadDistance > maxReachableDistance) {
      console.log(`❌ Station too far: ${estimatedRoadDistance.toFixed(1)}km (est.) > ${maxReachableDistance.toFixed(1)}km (70% of range)`);
      continue;
    }
    
    // Allow stations that can be reached with higher battery remaining (no minimum distance)
    // This allows using stations with less battery usage if detour is smaller
    
    // Use straight-line distance from station to destination 
    const roadDistanceToEnd = calculateStraightLineDistance(station.latitude, station.longitude, end.lat, end.lng);
    
    // Check if station can complete the journey with a full charge
    // Use more conservative estimate: straight-line * 1.4 to account for road routing
    const estimatedDistanceToEnd = roadDistanceToEnd * 1.4;
    if (estimatedDistanceToEnd > parseFloat(batteryRange) - 20) { // 20km safety buffer
      console.log(`❌ Cannot reach destination: ${estimatedDistanceToEnd}km (est.) > ${parseFloat(batteryRange) - 20}km (range - safety)`);
      continue;
    }
    
    const batteryRemainingAtStation = ((parseFloat(batteryRange) - estimatedRoadDistance) / parseFloat(batteryRange) * 100);
    
    console.log(`✅ Station viable: ${estimatedRoadDistance}km to reach, ${estimatedDistanceToEnd}km to destination, ${batteryRemainingAtStation.toFixed(1)}% battery remaining`);
    
    // Add distance data to station (using estimated road distances)
    station.roadDistanceFromStart = estimatedRoadDistance;
    station.roadDistanceToEnd = estimatedDistanceToEnd;
    station.batteryRemainingAtStation = batteryRemainingAtStation;
    
    viableStations.push(station);
  }
  
  // Clean up temporary properties
  nearbyStations.forEach(station => {
    delete station._distanceToWaypoint;
  });
  
  return viableStations;
}

// Function to score and rank charging stations with accurate detour calculations
async function scoreAndRankStations(viableStations, start, end, totalDistance, batteryRange, batteryCapacity, googleMapsApiKey) {
  const scoredStations = [];
  
  console.log(`Scoring ${viableStations.length} viable stations with accurate detour calculations...`);
  
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
    const targetDistance = parseFloat(batteryRange) * 0.75; // Our ideal charging point (75% of battery range)
    const distanceFromTarget = Math.abs(distanceFromStart - targetDistance);
    const batteryRemainingAtStation = ((parseFloat(batteryRange) - distanceFromStart) / parseFloat(batteryRange)) * 100;
    
    // New scoring system that heavily prioritizes minimal actual detour
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
      remainingRangeAtDestination: Math.round((parseFloat(batteryRange) - distanceToEnd) * 10) / 10,
      routingSuccess: detourCalculation.success
    });
  }

  // Sort by efficiency score (highest first)
  const sortedStations = scoredStations
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore) // Higher score is better
    .slice(0, 10); // Return top 10 stations

  console.log(`Top 3 stations by efficiency score:`);
  sortedStations.slice(0, 3).forEach((station, index) => {
    console.log(`${index + 1}. ${station.title || 'Unknown'} - Actual Detour: ${station.actualDetour}km, Score: ${station.efficiencyScore}`);
  });

  return sortedStations;
}

// Main function to find recommended charging station
async function findRecommendedChargingStation(start, end, batteryRange, batteryCapacity, allStations, googleMapsApiKey) {
  try {
    console.log(`Finding charging station for route from ${start.lat},${start.lng} to ${end.lat},${end.lng}`);
    console.log(`Vehicle specs: ${batteryRange}km range, ${batteryCapacity}kWh capacity`);
    
    // Step 1: Calculate the full route distance using Google Maps API
    const routeData = await calculateActualRouteDistance(start, end, googleMapsApiKey);
    const totalDistance = routeData.distance;
    
    console.log(`Route distance: ${totalDistance}km`);
    
    // Step 2: Calculate charging waypoint using actual route geometry
    const chargingWaypoint = await calculateChargingWaypoint(start, end, totalDistance, batteryRange, googleMapsApiKey);
    
    if (!chargingWaypoint) {
      return {
        success: false,
        message: "No charging needed - trip is within vehicle range",
        totalDistance: Math.round(totalDistance * 10) / 10
      };
    }
    
    console.log(`Charging waypoint calculated at ${chargingWaypoint.lat},${chargingWaypoint.lng} (${chargingWaypoint.distanceFromStart}km from start)`);
    
    // Step 3: Filter viable stations using straight-line calculations and preliminary scoring
    const viableStations = await filterViableStations(allStations, start, end, chargingWaypoint, batteryRange, batteryCapacity, googleMapsApiKey);
    
    if (viableStations.length === 0) {
      return {
        success: false,
        message: "No viable stations found in initial filtering"
      };
    }
    
    console.log(`Found ${viableStations.length} viable stations after initial filtering`);
    
    // Step 4: Score and rank the viable stations using accurate detour calculations
    const scoredStations = await scoreAndRankStations(viableStations, start, end, totalDistance, batteryRange, batteryCapacity, googleMapsApiKey);
    
    if (scoredStations.length === 0) {
      return {
        success: false,
        message: "No stations found within optimal charging range"
      };
    }
    
    // Step 5: Return the best station with full details
    const bestStation = scoredStations[0];
    
    console.log(`Selected best station: ${bestStation.title || 'Unknown'} with actual detour of ${bestStation.actualDetour}km`);
    
    return {
      success: true,
      station: bestStation,
      totalDistance: Math.round(totalDistance * 10) / 10,
      chargingWaypoint: chargingWaypoint,
      alternatives: scoredStations.slice(1),
      message: `Best station: ${bestStation.title || 'Unknown'} - Actual detour: ${bestStation.actualDetour}km (Score: ${bestStation.efficiencyScore})`
    };
    
  } catch (error) {
    console.error("Error in findRecommendedChargingStation:", error);
    return {
      success: false,
      message: `Error finding charging stations: ${error.message}`
    };
  }
}

module.exports = {
  findRecommendedChargingStation,
  calculateDistance,
  calculateStraightLineDistance,
  calculateActualDetour
};