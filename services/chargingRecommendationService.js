// Recommended Charging Station Logic
const fetch = require("node-fetch");

// Helper function to calculate straight line distance between two points
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
    const directRouteUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lon1}&destination=${lat2},${lon2}&key=${googleMapsApiKey}`;

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
    // Use env variable if not provided
    if (!googleMapsApiKey) {
      googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    }

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
  // Target charging when we have 20% battery remaining (80% of battery range used)
  const targetDistanceFromStart = parseFloat(batteryRange) * 0.8;

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
        for (const station of stationsToCheck) {
          // Use unique station ID or lat/lng as cache key
          const stationId = station.id || `${station.latitude},${station.longitude}`;
          if (foundStationIds.has(stationId)) continue;
          // Use Google API to check actual route distance from step to station
          const routeDistanceToStation = await calculateDistance(stepLat, stepLng, station.latitude, station.longitude, googleMapsApiKey);
          // Reachability check: can you reach the station from start with current battery?
          const routeDistanceFromStart = await calculateDistance(start.lat, start.lng, station.latitude, station.longitude, googleMapsApiKey);
          const buffer = 10; // km safety buffer
          if (routeDistanceToStation <= 2 && routeDistanceFromStart <= parseFloat(batteryRange) - buffer) {
            station.roadDistanceFromStart = routeDistanceFromStart;
            station.roadDistanceToEnd = await calculateDistance(station.latitude, station.longitude, end.lat, end.lng, googleMapsApiKey);
              station.batteryRemainingAtStation = 100 - ((routeDistanceFromStart / parseFloat(batteryCapacity)) * 100);
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
      return viableStations;
    }
    return viableStations;
}

// Function to score and rank charging stations with accurate detour calculations
async function scoreAndRankStations(viableStations, start, end, totalDistance, batteryRange, batteryCapacity, googleMapsApiKey) {
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
  const targetDistance = parseFloat(batteryCapacity) * 0.75; // Our ideal charging point (75% of battery capacity)
  const distanceFromTarget = Math.abs(distanceFromStart - targetDistance);
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

// Main function to find recommended charging station
async function findRecommendedChargingStation(start, end, batteryRange, batteryCapacity, allStations, googleMapsApiKey) {
  try {

    // Step 1: Calculate the full route distance using Google Maps API
    const routeData = await calculateActualRouteDistance(start, end, googleMapsApiKey);
    const totalDistance = routeData.distance;

    // Step 2: Calculate charging waypoint using actual route geometry
    let chargingWaypoint = await calculateChargingWaypoint(start, end, totalDistance, batteryRange, googleMapsApiKey);

    // Fallback: If chargingWaypoint is undefined, use straight-line interpolation
    if (!chargingWaypoint) {
      const progressRatio = Math.min((parseFloat(batteryRange) * 0.8) / totalDistance, 0.9);
      const targetLat = start.lat + (end.lat - start.lat) * progressRatio;
      const targetLng = start.lng + (end.lng - start.lng) * progressRatio;
      chargingWaypoint = {
        lat: targetLat,
        lng: targetLng,
        distanceFromStart: parseFloat(batteryRange) * 0.8,
        distanceToEnd: totalDistance - (parseFloat(batteryRange) * 0.8),
        routeGeometry: null,
        routeSteps: []
      };
    }

    // Fix: Charging is needed if batteryRange < totalDistance
    if (parseFloat(batteryRange) >= totalDistance) {
      // Calculate range and percent at arrival
      const rangeAtArrival = parseFloat(batteryRange) - totalDistance;
      const percentAtArrival = (rangeAtArrival / parseFloat(batteryCapacity)) * 100;

      return {
        success: true,
        needsCharging: false,
        message: "No charging needed - trip is within vehicle range",
        totalDistance: Number(Math.round(totalDistance * 10) / 10),
        estimatedTime: Number(routeData.duration), // duration in minutes
        rangeAtArrival: Number(Math.round(rangeAtArrival * 10) / 10),
        percentAtArrival: Number(Math.round(percentAtArrival * 10) / 10)
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
    
    // Step 4: Score and rank the viable stations using accurate detour calculations
    const scoredStations = await scoreAndRankStations(viableStations, start, end, totalDistance, batteryRange, batteryCapacity, googleMapsApiKey);
    
    if (scoredStations.length === 0) {
      return {
        success: false,
        message: "No stations found within optimal charging range"
      };
    }
    
    // Step 5: Enforce buffer: only recommend charging if remaining range at destination is at least 20% of batteryRange
    const bestStation = scoredStations[0];
  const minBufferPercent = 20;
  const minBufferRange = parseFloat(batteryCapacity) * (minBufferPercent / 100);
    if (bestStation.remainingRangeAtDestination < minBufferRange) {
      return {
        success: true,
        needsCharging: true,
        station: bestStation,
        totalDistance: Math.round(totalDistance * 10) / 10,
        chargingWaypoint: chargingWaypoint,
        alternatives: scoredStations.slice(1),
        warning: `Warning: After charging at this station, you will not reach the destination with the required buffer (${minBufferPercent}%). More charging may be needed.`,
        message: `Best station: ${bestStation.title || 'Unknown'} - Actual detour: ${bestStation.actualDetour}km (Score: ${bestStation.efficiencyScore})`
      };
    }
    return {
      success: true,
      needsCharging: true,
      station: bestStation,
      totalDistance: Math.round(totalDistance * 10) / 10,
      chargingWaypoint: chargingWaypoint,
      alternatives: scoredStations.slice(1),
      message: `Best station: ${bestStation.title || 'Unknown'} - Actual detour: ${bestStation.actualDetour}km (Score: ${bestStation.efficiencyScore})`
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
  calculateStraightLineDistance,
  calculateActualDetour
};