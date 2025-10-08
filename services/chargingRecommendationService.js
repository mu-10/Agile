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
    return distanceCache.get(cacheKey);
  }

  try {
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lon1}&destination=${lat2},${lon2}&key=${googleMapsApiKey}`;
    const response = await fetch(directRouteUrl);
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
      return {
        distance: calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng),
        avgSpeed: 80 // fallback speed
      };
    }
    
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&key=${googleMapsApiKey}`;
    
    const directRouteResponse = await fetch(directRouteUrl);
    const directRouteData = await directRouteResponse.json();
    
    if (directRouteData.status !== 'OK' || !directRouteData.routes.length) {
      return {
        distance: calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng),
        avgSpeed: 80
      };
    }
    
    const route = directRouteData.routes[0];
    const totalDistance = route.legs[0].distance.value / 1000; // Convert to km
    const totalDuration = route.legs[0].duration.value / 3600; // Convert to hours
    const avgSpeed = totalDistance / totalDuration;
    
    return {
      distance: totalDistance,
      avgSpeed: avgSpeed
    };
  } catch (error) {
    return {
      distance: calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng),
      avgSpeed: 80
    };
  }
}

// Function to calculate charging waypoint at 75% of battery range (25% battery remaining)
function calculateChargingWaypoint(start, end, totalDistance, batteryRange) {
  // If trip is shorter than battery range, no charging needed
  if (totalDistance <= parseFloat(batteryRange) * 0.9) {
    return null;
  }
  
  // Target charging when we have 25% battery remaining (75% of battery range used)
  const targetDistanceFromStart = parseFloat(batteryRange) * 0.75; // 75% of battery range, not route
  
  // Calculate progress ratio along the route based on target distance
  const progressRatio = Math.min(targetDistanceFromStart / totalDistance, 0.9); // Never more than 90% of route
  
  // Calculate target waypoint coordinates using linear interpolation
  const targetLat = start.lat + (end.lat - start.lat) * progressRatio;
  const targetLng = start.lng + (end.lng - start.lng) * progressRatio;
  
  return {
    lat: targetLat,
    lng: targetLng,
    distanceFromStart: targetDistanceFromStart,
    distanceToEnd: totalDistance - targetDistanceFromStart
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
    
    // Only consider stations within 30km of the target charging point
    if (distanceToWaypoint > 30) {
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
    
    // Calculate preliminary efficiency score for initial filtering
    const maxPowerKW = getMaxChargingPower(station);
    const detourEstimate = distanceToWaypoint; // Approximate detour as distance from waypoint
    const chargingTimeHours = estimateChargingTime(maxPowerKW, parseFloat(batteryCapacity));
    
    const preliminaryScore = 
      1000 - 
      (detourEstimate * 10) -  // Penalty for being far from route
      (chargingTimeHours * 60 * 0.5) + // Charging time penalty
      ((station.numberOfPoints || 1) * 5) + // Bonus for more charging points
      (maxPowerKW > 100 ? 20 : 0) + // Bonus for fast charging
      (maxPowerKW > 200 ? 10 : 0); // Extra bonus for ultra-fast
    
    // Store data for sorting and later processing
    station._distanceToWaypoint = distanceToWaypoint;
    station._preliminaryScore = preliminaryScore;
    
    return true;
  });
  
  // Sort by preliminary efficiency score (best candidates first)
  nearbyStations.sort((a, b) => b._preliminaryScore - a._preliminaryScore);
  
  const maxCandidates = Math.min(nearbyStations.length, 15); // Check top 15 by preliminary score
  const candidates = nearbyStations.slice(0, maxCandidates);
  
  // Second pass: Use Google Maps API to get precise distances for top candidates
  const viableStations = [];
  
  for (const station of candidates) {
    // Calculate precise road distance from start to station
    const roadDistanceFromStart = await calculateDistance(start.lat, start.lng, station.latitude, station.longitude, googleMapsApiKey);
    
    // Check if this station is reachable (must have at least 20% battery when arriving)
    if (roadDistanceFromStart > parseFloat(batteryRange) * 0.80) { // 20% battery remaining minimum
      continue;
    }
    
    // Allow stations that can be reached with higher battery remaining (no minimum distance)
    // This allows using stations with less battery usage if detour is smaller
    
    // Calculate precise road distance from station to destination
    const roadDistanceToEnd = await calculateDistance(station.latitude, station.longitude, end.lat, end.lng, googleMapsApiKey);
    
    // Check if station can complete the journey with a full charge
    if (roadDistanceToEnd > parseFloat(batteryRange) - 20) { // 20km safety buffer
      continue;
    }
    
    const batteryRemainingAtStation = ((parseFloat(batteryRange) - roadDistanceFromStart) / parseFloat(batteryRange) * 100);
    
    // Add precise distance data to station
    station.roadDistanceFromStart = roadDistanceFromStart;
    station.roadDistanceToEnd = roadDistanceToEnd;
    station.batteryRemainingAtStation = batteryRemainingAtStation;
    
    viableStations.push(station);
  }
  
  // Clean up temporary properties
  nearbyStations.forEach(station => {
    delete station._distanceToWaypoint;
    delete station._preliminaryScore;
  });
  
  return viableStations;
}

// Function to score and rank charging stations with precise road distances
async function scoreAndRankStations(viableStations, start, end, totalDistance, batteryRange, batteryCapacity, googleMapsApiKey) {
  const scoredStations = [];
  
  for (const station of viableStations) {
    const distanceFromStart = station.roadDistanceFromStart;
    const distanceToEnd = station.roadDistanceToEnd;
    const totalDistanceViaStation = distanceFromStart + distanceToEnd;
    const detourDistance = totalDistanceViaStation - totalDistance;
    
    // Calculate distance from route using triangulation
    const distanceFromRoute = Math.abs(detourDistance) / 2;
    
    // Get charging specifications
    const maxPowerKW = getMaxChargingPower(station);
    const chargingTimeHours = estimateChargingTime(maxPowerKW, parseFloat(batteryCapacity));
    const chargingTimeMinutes = chargingTimeHours * 60;

    // Calculate final efficiency score (higher is better)
    const targetDistance = parseFloat(batteryRange) * 0.75; // Our ideal charging point (75% of battery range)
    const distanceFromTarget = Math.abs(distanceFromStart - targetDistance);
    const batteryRemainingAtStation = ((parseFloat(batteryRange) - distanceFromStart) / parseFloat(batteryRange)) * 100;
    
    const efficiencyScore =
      1000 - // Base positive score
      (detourDistance * 100) - // VERY HEAVY detour penalty - prioritize minimal detour
      (distanceFromRoute * 5) - // Distance from route penalty
      (chargingTimeMinutes * 0.1) - // Charging time penalty
      (distanceFromTarget * 1) + // Small penalty for being far from ideal charging point
      (batteryRemainingAtStation > 30 && detourDistance < 5 ? 50 : 0) + // BIG bonus for high battery + low detour
      (batteryRemainingAtStation > 40 && detourDistance < 2 ? 30 : 0) + // Extra bonus for very high battery + minimal detour  
      ((station.numberOfPoints || 1) * 5) + // Bonus for more charging points
      (maxPowerKW > 100 ? 10 : 0) + // Bonus for fast charging
      (maxPowerKW > 200 ? 5 : 0); // Extra bonus for ultra-fast charging

    scoredStations.push({
      ...station,
      distanceFromStart: Math.round(distanceFromStart * 10) / 10,
      distanceToEnd: Math.round(distanceToEnd * 10) / 10,
      totalDistanceViaStation: Math.round(totalDistanceViaStation * 10) / 10,
      detourDistance: Math.round(detourDistance * 10) / 10,
      distanceFromRoute: Math.round(distanceFromRoute * 10) / 10,
      batteryRemainingAtStation: Math.round(batteryRemainingAtStation * 10) / 10,
      maxPowerKW,
      estimatedChargingTimeMinutes: Math.round(chargingTimeMinutes),
      efficiencyScore: Math.round(efficiencyScore * 10) / 10,
      remainingRangeAtDestination: Math.round((parseFloat(batteryRange) - distanceToEnd) * 10) / 10
    });
  }

  // Sort by efficiency score (highest first)
  const sortedStations = scoredStations
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore) // Higher score is better
    .slice(0, 10); // Return top 10 stations

  return sortedStations;
}

// Main function to find recommended charging station
async function findRecommendedChargingStation(start, end, batteryRange, batteryCapacity, allStations, googleMapsApiKey) {
  try {
    // Step 1: Calculate the full route distance using Google Maps API
    const routeData = await calculateActualRouteDistance(start, end, googleMapsApiKey);
    const totalDistance = routeData.distance;
    
    // Step 2: Calculate charging waypoint at 75% of battery range (25% battery remaining)
    const chargingWaypoint = calculateChargingWaypoint(start, end, totalDistance, batteryRange);
    
    if (!chargingWaypoint) {
      return {
        success: false,
        message: "No charging needed - trip is within vehicle range",
        totalDistance: Math.round(totalDistance * 10) / 10
      };
    }
    
    // Step 3: Filter viable stations using straight-line calculations and preliminary scoring
    const viableStations = await filterViableStations(allStations, start, end, chargingWaypoint, batteryRange, batteryCapacity, googleMapsApiKey);
    
    if (viableStations.length === 0) {
      return {
        success: false,
        message: "No viable stations found in initial filtering"
      };
    }
    
    // Step 4: Score and rank the viable stations using precise road distances
    const scoredStations = await scoreAndRankStations(viableStations, start, end, totalDistance, batteryRange, batteryCapacity, googleMapsApiKey);
    
    if (scoredStations.length === 0) {
      return {
        success: false,
        message: "No stations found within optimal charging range"
      };
    }
    
    // Step 5: Return the best station with full details
    const bestStation = scoredStations[0];
    
    return {
      success: true,
      station: bestStation,
      totalDistance: Math.round(totalDistance * 10) / 10,
      chargingWaypoint: chargingWaypoint,
      alternatives: scoredStations.slice(1),
      message: `Best station: ${bestStation.title || 'Unknown'} - ${bestStation.distanceFromStart}km from start (Efficiency Score: ${bestStation.efficiencyScore})`
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Error finding charging stations: ${error.message}`
    };
  }
}

module.exports = {
  findRecommendedChargingStation,
  calculateDistance,
  calculateStraightLineDistance
};