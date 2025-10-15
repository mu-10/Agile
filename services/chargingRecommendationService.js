// Recommended Charging Station Logic
const fetch = require("node-fetch");

// Constants and utilities
const EARTH_KM = 6371;

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const rLat1 = lat1 * toRad;
  const rLat2 = lat2 * toRad;

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Backward compatibility
function calculateStraightLineDistance(lat1, lon1, lat2, lon2) {
  return haversineKm(lat1, lon1, lat2, lon2);
}

// Build cumulative distances along routePoints (routePoints = [{lat,lng}, ...])
function buildCumulativeRouteKm(routePoints) {
  const cum = [0];
  for (let i = 0; i < routePoints.length - 1; i++) {
    const d = haversineKm(
      routePoints[i].lat, routePoints[i].lng,
      routePoints[i + 1].lat, routePoints[i + 1].lng
    );
    cum.push(cum[cum.length - 1] + d);
  }
  return cum; // length == routePoints.length
}

// Project a point onto the nearest segment of the route and return distance along route (km)
function projectPointOntoRoute(routePoints, cumKm, point) {
  if (!routePoints || routePoints.length === 0) {
    return { routeKm: 0, distanceToRouteKm: haversineKm(point.lat, point.lng, 0, 0) }; // fallback weird case
  }

  let best = { routeKm: 0, distanceToRouteKm: Infinity };

  // For each segment, compute point-to-segment perpendicular projection (approx using lat/lon linear interpolation)
  for (let i = 0; i < routePoints.length - 1; i++) {
    const A = routePoints[i];
    const B = routePoints[i + 1];

    // Convert to simple 2D coords: use lat/lon degrees weighted by approximate km conversion at that latitude.
    // For accuracy across large distances you'd use ECEF; this simplified method is fine for nearby projections.
    const avgLat = (A.lat + B.lat + point.lat) / 3 * Math.PI / 180;
    const latKm = 111.32; // ~ km per degree lat
    const lonKm = Math.cos(avgLat) * 111.32;

    const Ax = A.lat * latKm;
    const Ay = A.lng * lonKm;
    const Bx = B.lat * latKm;
    const By = B.lng * lonKm;
    const Px = point.lat * latKm;
    const Py = point.lng * lonKm;

    const vx = Bx - Ax;
    const vy = By - Ay;
    const wx = Px - Ax;
    const wy = Py - Ay;
    const vlen2 = vx * vx + vy * vy;
    const t = vlen2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));

    const projX = Ax + t * vx;
    const projY = Ay + t * vy;

    const dx = Px - projX;
    const dy = Py - projY;
    const distKm = Math.sqrt(dx * dx + dy * dy);

    // routeKm at projection = cumKm[i] + t * (segmentLength)
    const segLengthKm = cumKm[i + 1] - cumKm[i];
    const routeKmAtProj = cumKm[i] + t * segLengthKm;

    if (distKm < best.distanceToRouteKm) {
      best = { routeKm: routeKmAtProj, distanceToRouteKm: distKm };
    }
  }

  return best;
}

// Filter stations by proximity to route and annotate with routeKm
function mapStationsToRoute(routePoints, routeCumKm, stations, maxDeviationKm = 2) {
  return stations
    .map(s => {
      if (s.latitude == null || s.longitude == null) return null;
      const proj = projectPointOntoRoute(routePoints, routeCumKm, { lat: s.latitude, lng: s.longitude });
      return {
        ...s,
        routeKm: proj.routeKm,
        routeDeviationKm: proj.distanceToRouteKm
      };
    })
    .filter(s => s && s.routeDeviationKm <= maxDeviationKm);
}

// Greedy planner: pick farthest reachable station along the route until destination reachable
function planGreedyStops({ routePoints, totalRouteKm, allStations, startRouteKm = 0, currentRangeKm, maxRangeKm, safeFactor = 0.8, maxStops = 10 }) {
  const cumKm = buildCumulativeRouteKm(routePoints);

  let curKm = startRouteKm;
  let range = currentRangeKm;
  const stops = [];

  // if we can reach destination immediately
  if (range >= totalRouteKm - curKm) {
    return { stops, reachable: true };
  }

  while (stops.length < maxStops) {
    const reachableKm = curKm + range * safeFactor;

    console.log(`  Planning hop ${stops.length + 1}: from ${curKm.toFixed(1)}km can reach ${reachableKm.toFixed(1)}km along route`);

    // RE-FILTER stations for this hop - start with appropriate proximity based on hop number
    let maxDeviationKm = stops.length === 0 ? 2 : 5; // 2km for first hop, 5km for subsequent
    let stationsOnRoute = mapStationsToRoute(routePoints, cumKm, allStations, maxDeviationKm);
    
    console.log(`  Re-filtering: Found ${stationsOnRoute.length} stations within ${maxDeviationKm}km of route for this hop`);
    
    // If no stations found and this isn't the first hop, try more flexible proximity
    if (stationsOnRoute.length === 0 && stops.length > 0) {
      maxDeviationKm = 15; // Very flexible for sparse areas
      stationsOnRoute = mapStationsToRoute(routePoints, cumKm, allStations, maxDeviationKm);
      console.log(`  Expanded to ${maxDeviationKm}km: Found ${stationsOnRoute.length} stations`);
    }

    // Sort stations by routeKm ascending
    const stationsSorted = stationsOnRoute.slice().sort((a, b) => a.routeKm - b.routeKm);

    // get stations with routeKm > curKm and <= reachableKm
    // Allow small backtrack (10km) to pick up stations we might have passed
    const minRouteKm = Math.max(0, curKm - 10);
    const reachableStations = stationsSorted.filter(s => s.routeKm >= minRouteKm && s.routeKm <= reachableKm && !stops.some(x => x.id === s.id));

    console.log(`  Found ${reachableStations.length} reachable stations between ${minRouteKm.toFixed(1)}km and ${reachableKm.toFixed(1)}km (allowing 10km backtrack)`);
    
    if (reachableStations.length === 0) {
      console.log(`  No stations reachable in range. Station distribution along route:`);
      
      // Show stations in different sections of the route
      const sections = [
        { name: "Early route (0-100km)", min: 0, max: 100 },
        { name: "Mid route (100-200km)", min: 100, max: 200 },
        { name: "Late route (200-300km)", min: 200, max: 300 },
        { name: "End route (300km+)", min: 300, max: 999 }
      ];
      
      sections.forEach(section => {
        const sectionStations = stationsSorted.filter(s => s.routeKm >= section.min && s.routeKm < section.max);
        console.log(`    ${section.name}: ${sectionStations.length} stations`);
        if (sectionStations.length > 0) {
          console.log(`      First: ${sectionStations[0].title || 'Unknown'} at ${sectionStations[0].routeKm.toFixed(1)}km`);
          console.log(`      Last: ${sectionStations[sectionStations.length-1].title || 'Unknown'} at ${sectionStations[sectionStations.length-1].routeKm.toFixed(1)}km`);
        }
      });
      
      // no station reachable — fail
      return { stops, reachable: false, reason: 'no_reachable_station' };
    }

    // pick the furthest station along route (greedy), but ensure minimum progress
    const minProgressKm = 20; // Require at least 20km progress to avoid getting stuck
    const forwardStations = reachableStations.filter(s => s.routeKm > curKm); // Only forward progress
    
    let next;
    if (forwardStations.length > 0) {
      // Prefer stations with good progress, but take any forward progress if needed
      const goodProgressStations = forwardStations.filter(s => s.routeKm >= curKm + minProgressKm);
      next = goodProgressStations.length > 0 
        ? goodProgressStations[goodProgressStations.length - 1] // Furthest with good progress
        : forwardStations[forwardStations.length - 1]; // Furthest with any forward progress
    } else {
      // No forward stations - this is a gap in coverage
      console.log(`  ❌ No stations ahead of current position ${curKm.toFixed(1)}km`);
      return { stops, reachable: false, reason: 'no_forward_stations' };
    }
    
    console.log(`  Selected: ${next.title || 'Unknown'} at ${next.routeKm.toFixed(1)}km (${next.routeDeviationKm.toFixed(1)}km from route)`);

    // Check if we're making insufficient progress (stuck in a loop)
    if (stops.length > 0) {
      const lastStopKm = stops[stops.length - 1].routeKm;
      const progress = next.routeKm - lastStopKm;
      console.log(`  Progress from last stop: ${progress.toFixed(1)}km`);
      
      if (Math.abs(progress) < 5) { // Less than 5km progress
        console.log(`  ❌ Insufficient progress (${progress.toFixed(1)}km), ending planning`);
        return { stops, reachable: false, reason: 'insufficient_progress' };
      }
    }

    stops.push(next);

    // move to that station: update current position and recharge to full
    curKm = next.routeKm;
    range = maxRangeKm;

    // can we reach destination now? (apply safety factor to remaining range)
    const remainingDistance = totalRouteKm - curKm;
    const usableRange = range * safeFactor;
    
    console.log(`  After charging at ${next.title}: position ${curKm.toFixed(1)}km, remaining ${remainingDistance.toFixed(1)}km, usable range ${usableRange.toFixed(1)}km`);
    
    if (usableRange >= remainingDistance) {
      console.log(`  ✅ Can reach destination from this station`);
      return { stops, reachable: true };
    } else {
      console.log(`  🔋 Need additional charging stops`);
    }
  }

  return { stops, reachable: false, reason: 'too_many_stops' };
}

// Calculate actual Google Maps route distance and get route geometry
async function calculateActualRouteDistance(start, end, googleMapsApiKey) {
  if (!googleMapsApiKey) {
    const straightDistance = calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng);
    
    // Create a more realistic route approximation for Sweden (following E6/E4 highways)
    const routePoints = [];
    
    // For Göteborg to Stockholm, approximate the E6 -> E20 -> E4 route
    if (start.lat > 57.5 && start.lat < 58 && end.lat > 59 && end.lat < 60) {
      console.log('Using Sweden E6/E4 highway approximation');
      
      // Key waypoints approximating the highway route
      const waypoints = [
        start, // Göteborg
        { lat: 57.8, lng: 12.1 }, // North of Göteborg on E6
        { lat: 58.3, lng: 11.9 }, // Uddevalla area
        { lat: 58.7, lng: 12.8 }, // Towards E20
        { lat: 58.9, lng: 13.8 }, // On E20
        { lat: 59.0, lng: 15.0 }, // Continuing east on E20
        { lat: 59.2, lng: 16.5 }, // Approaching E4
        { lat: 59.25, lng: 17.5 }, // On E4 towards Stockholm
        end // Stockholm
      ];
      
      // Add interpolated points between waypoints
      for (let i = 0; i < waypoints.length - 1; i++) {
        const wp1 = waypoints[i];
        const wp2 = waypoints[i + 1];
        
        // Add points between each waypoint
        const segmentPoints = 5;
        for (let j = 0; j <= segmentPoints; j++) {
          const ratio = j / segmentPoints;
          const lat = wp1.lat + (wp2.lat - wp1.lat) * ratio;
          const lng = wp1.lng + (wp2.lng - wp1.lng) * ratio;
          routePoints.push({ lat, lng });
        }
      }
    } else {
      // Fallback to straight-line for other routes
      const numPoints = Math.max(10, Math.floor(straightDistance / 20));
      for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        const lat = start.lat + (end.lat - start.lat) * ratio;
        const lng = start.lng + (end.lng - start.lng) * ratio;
        routePoints.push({ lat, lng });
      }
    }
    
    console.log(`Created ${routePoints.length} route points for highway approximation`);
    
    return {
      distance: straightDistance * 1.2, // Highway routes are typically 20% longer than straight-line
      duration: Math.round((straightDistance * 1.2 / 80) * 60),
      routePoints: routePoints
    };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&mode=driving&alternatives=false&key=${googleMapsApiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const route = data.routes[0];
      const leg = route.legs[0];
      
      // Extract route points for proximity checking
      const routePoints = [];
      if (route.overview_polyline && route.overview_polyline.points) {
        // Decode polyline to get route coordinates
        const decoded = decodePolyline(route.overview_polyline.points);
        routePoints.push(...decoded);
      }
      
      return {
        distance: leg.distance.value / 1000, // Convert to km
        duration: leg.duration.value / 60, // Convert to minutes
        routePoints: routePoints
      };
    } else {
      const straightDistance = calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng);
      return {
        distance: straightDistance,
        duration: Math.round((straightDistance / 80) * 60),
        routePoints: []
      };
    }
  } catch (error) {
    console.error('Route calculation error:', error);
    const straightDistance = calculateStraightLineDistance(start.lat, start.lng, end.lat, end.lng);
    return {
      distance: straightDistance,
      duration: Math.round((straightDistance / 80) * 60),
      routePoints: []
    };
  }
}

// Simple polyline decoder
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// Check if station is within specified distance of the route
function isStationNearRoute(station, routePoints, maxDeviationKm = 2) {
  if (routePoints.length === 0) return true; // If no route data, allow all stations
  
  let minDistance = Infinity;
  
  // For performance, check every 5th route point if we have many points
  const step = routePoints.length > 50 ? Math.ceil(routePoints.length / 20) : 1;
  
  for (let i = 0; i < routePoints.length; i += step) {
    const routePoint = routePoints[i];
    const distance = calculateStraightLineDistance(
      station.latitude, station.longitude,
      routePoint.lat, routePoint.lng
    );
    minDistance = Math.min(minDistance, distance);
    
    // Early exit if station is close enough
    if (minDistance <= maxDeviationKm) {
      return true;
    }
  }
  
  // Store the minimum distance for debugging
  station.routeDeviation = minDistance;
  return minDistance <= maxDeviationKm;
}

// High-level orchestrator: accepts routePoints or fallback straight-line + stations list
async function findRecommendedChargingStation_v2(start, end, batteryRangeKm, batteryCapacityKm, allStations, routePoints = []) {
  console.log(`\n=== NEW CHARGING LOGIC V2 ===`);
  console.log(`Route: ${start.lat},${start.lng} -> ${end.lat},${end.lng}`);
  console.log(`Current Battery Range: ${batteryRangeKm} km`);
  console.log(`Maximum Battery Capacity: ${batteryCapacityKm} km`);
  
  // If routePoints not provided, build trivial route from start -> end
  if (!routePoints || routePoints.length < 2) {
    console.log(`No route points provided, using straight-line approximation`);
    // approximate route as straight line
    routePoints = [
      { lat: start.lat, lng: start.lng },
      { lat: end.lat, lng: end.lng }
    ];
  } else {
    console.log(`Using provided route with ${routePoints.length} points`);
  }

  const cumKm = buildCumulativeRouteKm(routePoints);
  const totalRouteKm = cumKm[cumKm.length - 1];
  
  console.log(`Total route distance: ${totalRouteKm.toFixed(1)} km`);

  // map stations onto route with a starting proximity filter (2km)
  let proxStations = allStations
    .map(s => ({ ...s })) // clone
    .filter(s => s && s.latitude != null && s.longitude != null);

  // First try strict 2km deviation
  let stationsOnRoute = mapStationsToRoute(routePoints, cumKm, proxStations, 2);
  console.log(`Found ${stationsOnRoute.length} stations within 2km of route`);

  // If insufficient stations, relax to 5km then 15km for long routes
  if (stationsOnRoute.length < 20 && totalRouteKm > 200) {
    console.log(`Only ${stationsOnRoute.length} stations within 2km for long route, trying 5km proximity...`);
    const stations5km = mapStationsToRoute(routePoints, cumKm, proxStations, 5);
    console.log(`Found ${stations5km.length} stations within 5km of route`);
    stationsOnRoute = stations5km;
    
    if (stationsOnRoute.length < 30) {
      console.log(`Still only ${stationsOnRoute.length} stations, trying 15km proximity for sparse areas...`);
      const stations15km = mapStationsToRoute(routePoints, cumKm, proxStations, 15);
      console.log(`Found ${stations15km.length} stations within 15km of route`);
      stationsOnRoute = stations15km;
    }
  }

  // Quick check: can we reach destination without charging?
  if (batteryRangeKm >= totalRouteKm) {
    console.log(`✅ NO CHARGING NEEDED`);
    return {
      success: true,
      needsCharging: false,
      message: 'No charging needed - trip is within vehicle range',
      totalDistance: Math.round(totalRouteKm * 10) / 10,
      rangeAtArrival: Math.round((batteryRangeKm - totalRouteKm) * 10) / 10
    };
  }

  // If full charge would cover the trip, recommend a single convenient station near start (within 50km & near route)
  if (batteryCapacityKm >= totalRouteKm) {
    console.log(`✅ SINGLE CHARGE NEEDED`);
    // find station near the start (within 50 km straight-line) and near route
    const nearStart = stationsOnRoute
      .map(s => ({ ...s, distFromStartKm: haversineKm(start.lat, start.lng, s.latitude, s.longitude) }))
      .filter(s => s.distFromStartKm <= 50)
      .sort((a, b) => a.distFromStartKm - b.distFromStartKm);

    console.log(`Found ${nearStart.length} stations near start (within 50km) and on route`);

    if (nearStart.length > 0) {
      const selectedStation = nearStart[0];
      console.log(`✅ Selected: ${selectedStation.title || 'Unknown'} (${selectedStation.distFromStartKm.toFixed(1)}km from start, ${selectedStation.routeDeviationKm.toFixed(1)}km from route)`);
      
      return {
        success: true,
        needsCharging: true,
        scenario: 'single_charge',
        station: selectedStation,
        totalDistance: Math.round(totalRouteKm * 10) / 10
      };
    }

    return { success: false, message: 'No station near start within 50km that is close to route' };
  }

  // Multi-stop planning: greedy on stations projected onto route
  console.log(`🔋 MULTIPLE CHARGES NEEDED`);
  
  // Map start position to routeKm too (so we handle if start is not exactly on route)
  const startProj = projectPointOntoRoute(routePoints, cumKm, { lat: start.lat, lng: start.lng });
  console.log(`Start position projected to ${startProj.routeKm.toFixed(1)}km along route`);
  
  const plan = planGreedyStops({
    routePoints,
    totalRouteKm,
    allStations: proxStations, // Pass all stations, let each hop re-filter
    startRouteKm: startProj.routeKm,
    currentRangeKm: batteryRangeKm,
    maxRangeKm: batteryCapacityKm,
    safeFactor: 0.8,
    maxStops: 10 // Increased from 6 to handle longer routes
  });

  if (!plan.reachable) {
    console.log(`❌ Unable to plan complete route: ${plan.reason}`);
    
    // If we got some stops but hit limits, return partial route with warning
    if (plan.stops.length > 0 && plan.reason === 'too_many_stops') {
      console.log(`⚠️  Returning partial route with ${plan.stops.length} stops`);
      return {
        success: true,
        needsCharging: true,
        scenario: 'multiple_charge_partial',
        chargingStops: plan.stops,
        station: plan.stops[0],
        totalDistance: Math.round(totalRouteKm * 10) / 10,
        warning: `Route requires more than ${plan.stops.length} charging stops. Consider using a vehicle with longer range for this route.`,
        partial: true
      };
    }
    
    return { success: false, needsCharging: true, message: 'Unable to plan route with available stations', reason: plan.reason };
  }

  console.log(`✅ Journey planned with ${plan.stops.length} charging stop(s):`);
  plan.stops.forEach((stop, i) => {
    console.log(`  ${i + 1}. ${stop.title || 'Unknown'} - ${stop.routeKm.toFixed(1)}km along route, ${stop.routeDeviationKm.toFixed(1)}km deviation`);
  });

  return {
    success: true,
    needsCharging: true,
    scenario: 'multiple_charge',
    chargingStops: plan.stops,
    station: plan.stops[0], // For backward compatibility
    totalDistance: Math.round(totalRouteKm * 10) / 10
  };
}

// Wrapper to maintain backward compatibility with existing API
async function findRecommendedChargingStation(start, end, batteryRange, batteryCapacity, allStations, googleMapsApiKey) {
  try {
    // Convert string inputs to numbers
    const batteryRangeKm = parseFloat(batteryRange);
    const batteryCapacityKm = parseFloat(batteryCapacity);
    
    // Get route points from Google Maps if available
    let routePoints = [];
    let estimatedTime = null;
    
    if (googleMapsApiKey) {
      const routeData = await calculateActualRouteDistance(start, end, googleMapsApiKey);
      routePoints = routeData.routePoints || [];
      estimatedTime = Math.round(routeData.duration);
    }
    
    // If no Google Maps route points, create approximation
    if (routePoints.length === 0) {
      routePoints = await createRouteApproximation(start, end);
    }
    
    // Call the new v2 function
    const result = await findRecommendedChargingStation_v2(
      start, 
      end, 
      batteryRangeKm, 
      batteryCapacityKm, 
      allStations, 
      routePoints
    );
    
    // Add estimatedTime to result for backward compatibility
    if (estimatedTime && result.success) {
      result.estimatedTime = estimatedTime;
    }
    
    return result;
    
  } catch (error) {
    console.error('Charging recommendation error:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
}

// Create route approximation for cases without Google Maps
async function createRouteApproximation(start, end) {
  const straightDistance = haversineKm(start.lat, start.lng, end.lat, end.lng);
  
  // Create a more realistic route approximation for Sweden (following E6/E4 highways)
  const routePoints = [];
  
  // For Göteborg to Stockholm, approximate the E6 -> E20 -> E4 route
  if (start.lat > 57.5 && start.lat < 58 && end.lat > 59 && end.lat < 60) {
    console.log('Using Sweden E6/E4 highway approximation');
    
    // Key waypoints approximating the highway route
    const waypoints = [
      start, // Göteborg
      { lat: 57.8, lng: 12.1 }, // North of Göteborg on E6
      { lat: 58.3, lng: 11.9 }, // Uddevalla area
      { lat: 58.7, lng: 12.8 }, // Towards E20
      { lat: 58.9, lng: 13.8 }, // On E20
      { lat: 59.0, lng: 15.0 }, // Continuing east on E20
      { lat: 59.2, lng: 16.5 }, // Approaching E4
      { lat: 59.25, lng: 17.5 }, // On E4 towards Stockholm
      end // Stockholm
    ];
    
    // Add interpolated points between waypoints
    for (let i = 0; i < waypoints.length - 1; i++) {
      const wp1 = waypoints[i];
      const wp2 = waypoints[i + 1];
      
      // Add points between each waypoint
      const segmentPoints = 5;
      for (let j = 0; j <= segmentPoints; j++) {
        const ratio = j / segmentPoints;
        const lat = wp1.lat + (wp2.lat - wp1.lat) * ratio;
        const lng = wp1.lng + (wp2.lng - wp1.lng) * ratio;
        routePoints.push({ lat, lng });
      }
    }
  } else {
    // Fallback to straight-line for other routes
    const numPoints = Math.max(10, Math.floor(straightDistance / 20));
    for (let i = 0; i <= numPoints; i++) {
      const ratio = i / numPoints;
      const lat = start.lat + (end.lat - start.lat) * ratio;
      const lng = start.lng + (end.lng - start.lng) * ratio;
      routePoints.push({ lat, lng });
    }
  }
  
  console.log(`Created ${routePoints.length} route points for approximation`);
  return routePoints;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  return calculateStraightLineDistance(lat1, lon1, lat2, lon2);
}

function calculateActualDetour() {
  return 0;
}

module.exports = {
  findRecommendedChargingStation,
  findRecommendedChargingStation_v2,
  calculateDistance,
  calculateStraightLineDistance,
  haversineKm,
  buildCumulativeRouteKm,
  projectPointOntoRoute,
  calculateActualDetour
};
