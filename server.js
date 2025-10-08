//Get all charging stations from local database

require('dotenv').config({ quiet: true });
require('dotenv').config({ quiet: true });
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const ChargingStationDB = require('./database');
const app = express();

app.use(cors());
app.use(express.json());

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper function to calculate distance from a point to a line segment (route)
function distanceFromPointToRoute(pointLat, pointLng, startLat, startLng, endLat, endLng) {
  // Convert to radians for more accurate calculation
  const toRad = (deg) => deg * Math.PI / 180;
  
  // If start and end are the same point, return distance to that point
  if (startLat === endLat && startLng === endLng) {
    return calculateDistance(pointLat, pointLng, startLat, startLng);
  }
  
  // Calculate the perpendicular distance from point to line segment
  const startLatRad = toRad(startLat);
  const startLngRad = toRad(startLng);
  const endLatRad = toRad(endLat);
  const endLngRad = toRad(endLng);
  const pointLatRad = toRad(pointLat);
  const pointLngRad = toRad(pointLng);
  
  // Vector from start to end of route
  const routeLength = calculateDistance(startLat, startLng, endLat, endLng);
  
  if (routeLength === 0) {
    return calculateDistance(pointLat, pointLng, startLat, startLng);
  }
  
  // Calculate parameter t for the closest point on the line segment
  const dx = endLng - startLng;
  const dy = endLat - startLat;
  const t = Math.max(0, Math.min(1, 
    ((pointLng - startLng) * dx + (pointLat - startLat) * dy) / (dx * dx + dy * dy)
  ));
  
  // Find the closest point on the line segment
  const closestLat = startLat + t * (endLat - startLat);
  const closestLng = startLng + t * (endLng - startLng);
  
  return calculateDistance(pointLat, pointLng, closestLat, closestLng);
}

// Helper function to get maximum power from station connections
function getMaxPowerKW(connections) {
  if (!connections || connections.length === 0) return 50; // Default fallback
  return Math.max(...connections.map(conn => conn.powerKW || 50));
}

// Helper function to estimate charging time (in hours)
function estimateChargingTime(powerKW, batteryCapacityKm, targetChargePercent = 80) {
  // Assume 6 km per kWh efficiency
  const batteryCapacityKWh = batteryCapacityKm / 6;
  const energyToAdd = (batteryCapacityKWh * targetChargePercent) / 100;
  const chargingTimeHours = energyToAdd / Math.max(powerKW, 22); // Minimum 22kW
  return Math.max(0.25, chargingTimeHours); // Minimum 15 minutes
}

// Initialize database connection
let db;
const USE_DATABASE = process.env.USE_DATABASE !== 'false'; // Default to true, set to 'false' to use API

if (USE_DATABASE) {
  try {
    db = new ChargingStationDB();
    const stationCount = db.getStationCount();
    
    if (stationCount === 0) {
      console.log('WARNING: No stations in database. Run "node migrate.js" to populate the database.');
    }
  } catch (error) {
    console.error('Database connection failed:', error);
    console.log('Falling back to API mode');
    db = null;
  }
}

app.get("/api/charging-stations", async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Get bounds from query parameters
    const { north, south, east, west } = req.query;
    let { maxResults = 500 } = req.query;
    
    // Enforce different limits based on mode
    if (USE_DATABASE && db) {
      // Database mode: allow up to 10000 stations (more than enough for all data)
      maxResults = Math.min(parseInt(maxResults), 10000);
    } else {
      // API mode: hard cap at 500 to avoid rate limits
      maxResults = Math.min(parseInt(maxResults), 500);
    }
    
    let stations = [];
    
    // Use database if available and enabled
    if (USE_DATABASE && db) {
      try {
        if (north && south && east && west) {
          stations = db.getStationsInBounds(
            parseFloat(north), 
            parseFloat(south), 
            parseFloat(east), 
            parseFloat(west), 
            maxResults
          );
        } else {
          stations = db.getAllStations(maxResults);
        }
        
        return res.json(stations);
      } catch (dbError) {
        console.error('Database query failed:', dbError);
        console.log('Falling back to API');
        // Continue to API fallback below
      }
    }
    
    // Fallback to API (original implementation)
    console.log('Using external API');
    let apiUrl = "https://api.openchargemap.io/v3/poi/?output=json&countrycode=SE";
    
    // If bounds are provided, add them to the API request
    if (north && south && east && west) {
      apiUrl += `&boundingbox=(${south},${west}),(${north},${east})`;
      apiUrl += `&maxresults=${maxResults}`;
    } else {
      // Fallback to all of Sweden if no bounds provided
      apiUrl += `&maxresults=${maxResults}`;
    }
    
    const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Chargify/1.0 (x@email.com)",
          "X-API-Key": process.env.OPEN_CHARGE_MAP_API_KEY,
        },
      }
    );
    
    
    if (!response.ok) {
      throw new Error(
        `Open Charge Map error: ${response.status} ${response.statusText}`
      );
    }
    
    
    const data = await response.json();

    const formatted = data.map((station) => ({
      id: station.ID,
      title: station.AddressInfo?.Title,
      address: station.AddressInfo?.AddressLine1,
      town: station.AddressInfo?.Town,
      state: station.AddressInfo?.StateOrProvince,
      latitude: station.AddressInfo?.Latitude,
      longitude: station.AddressInfo?.Longitude,
      numberOfPoints: station.NumberOfPoints,
      statusType: station.StatusType?.Title,
      operator: station.OperatorInfo?.Title,
      usageCost: station.UsageCost || null,
      connections: station.Connections?.map((conn) => ({
        type: conn.ConnectionType?.Title,
        level: conn.Level?.Title,
        powerKW: conn.PowerKW,
        quantity: conn.Quantity,
      })),
    }));

    // Store in cache
    cache.set(cacheKey, {
      data: formatted,
      timestamp: Date.now()
    });

    res.json(formatted);
  } catch (err) {
    console.error("Backend error:", err);
    res.status(500).json({
      error: "Failed to fetch charging stations",
      details: err.message,
    });
  }
});

// New endpoint for finding optimal charging station for a route
app.post("/api/find-charging-stop", async (req, res) => {
  try {
    const { 
      startLat, 
      startLng, 
      endLat, 
      endLng, 
      batteryRange,
      batteryCapacity,
      currentBatteryPercent = 100
    } = req.body;

    // Validate required parameters
    if (!startLat || !startLng || !endLat || !endLng || !batteryRange || !batteryCapacity) {
      return res.status(400).json({
        error: "Missing required parameters"
      });
    }

    const start = { lat: parseFloat(startLat), lng: parseFloat(startLng) };
    const end = { lat: parseFloat(endLat), lng: parseFloat(endLng) };
    const totalDistance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    const currentRange = (parseFloat(batteryRange) * parseFloat(currentBatteryPercent)) / 100;
    
    // If route is within range, no charging needed
    if (totalDistance <= currentRange - 10) { // 10km safety buffer
      return res.json({
        needsCharging: false,
        totalDistance: Math.round(totalDistance * 10) / 10,
        currentRange: Math.round(currentRange * 10) / 10,
        message: "Trip is within battery range"
      });
    }

    // Need to find a charging station
    // Calculate how far we can travel before needing to charge (with 20% safety buffer)
    const maxDistanceBeforeCharging = currentRange * 0.8;
    
    let stations = [];

    // Get stations from database or API in a corridor around the route
    if (USE_DATABASE && db) {
      const bufferDegrees = 0.3; // 30km buffer as requested
      const north = Math.max(start.lat, end.lat) + bufferDegrees;
      const south = Math.min(start.lat, end.lat) - bufferDegrees;
      const east = Math.max(start.lng, end.lng) + bufferDegrees;
      const west = Math.min(start.lng, end.lng) - bufferDegrees;
      
      stations = db.getStationsInBounds(north, south, east, west, 2000);
    } else {
      // Fallback to API
      const bufferDegrees = 0.3; // 30km buffer to match database search
      const north = Math.max(start.lat, end.lat) + bufferDegrees;
      const south = Math.min(start.lat, end.lat) - bufferDegrees;
      const east = Math.max(start.lng, end.lng) + bufferDegrees;
      const west = Math.min(start.lng, end.lng) - bufferDegrees;
      
      const apiUrl = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=SE&boundingbox=(${south},${west}),(${north},${east})&maxresults=1000`;
      
      try {
        const response = await fetch(apiUrl, {
          headers: {
            "User-Agent": "Chargify/1.0 (charging@email.com)",
            "X-API-Key": process.env.OPEN_CHARGE_MAP_API_KEY,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          stations = data.map((station) => ({
            id: station.ID,
            title: station.AddressInfo?.Title,
            address: station.AddressInfo?.AddressLine1,
            town: station.AddressInfo?.Town,
            state: station.AddressInfo?.StateOrProvince,
            latitude: station.AddressInfo?.Latitude,
            longitude: station.AddressInfo?.Longitude,
            numberOfPoints: station.NumberOfPoints || 1,
            statusType: station.StatusType?.Title,
            operator: station.OperatorInfo?.Title,
            usageCost: station.UsageCost || null, // Real pricing information from API
            connections: station.Connections?.map((conn) => ({
              type: conn.ConnectionType?.Title,
              level: conn.Level?.Title,
              powerKW: conn.PowerKW,
              quantity: conn.Quantity,
            })) || [],
          }));
        }
      } catch (error) {
        console.error("API fetch failed:", error);
      }
    }

    const viableStations = stations
      .filter(station => {
        // Only include operational stations
        if (station.statusType && (
          station.statusType.toLowerCase().includes('not') || 
          station.statusType.toLowerCase().includes('closed') ||
          station.statusType.toLowerCase().includes('private')
        )) {
          return false;
        }
        
        // Check if station is reachable with current battery
        const distanceFromStart = calculateDistance(start.lat, start.lng, station.latitude, station.longitude);
        
        // Keep 80% safety margin for reachability
        if (distanceFromStart > maxDistanceBeforeCharging) {
          return false;
        }

        // Check if station can complete the journey OR get us significantly closer
        const distanceToEnd = calculateDistance(station.latitude, station.longitude, end.lat, end.lng);
        
        // More lenient destination check - allow any station that can reach destination
        // or reduces remaining distance meaningfully
        const canReachDestination = distanceToEnd <= parseFloat(batteryRange) - 5; // Only 5km safety buffer
        const isUsefulForLongTrip = distanceToEnd < totalDistance * 0.9; // Any reduction is helpful
        
        if (!canReachDestination && !isUsefulForLongTrip) {
          return false;
        }

        return true;
      });
    
    const scoredStations = viableStations.map(station => {
        const distanceFromStart = calculateDistance(start.lat, start.lng, station.latitude, station.longitude);
        const distanceToEnd = calculateDistance(station.latitude, station.longitude, end.lat, end.lng);
        const totalDistanceViaStation = distanceFromStart + distanceToEnd;
        const detourDistance = totalDistanceViaStation - totalDistance;
        
        // Calculate how far the station is from the direct route
        const distanceFromRoute = distanceFromPointToRoute(
          station.latitude, station.longitude, 
          start.lat, start.lng, 
          end.lat, end.lng
        );
        
        const maxPowerKW = getMaxPowerKW(station.connections);
        const chargingTimeHours = estimateChargingTime(maxPowerKW, parseFloat(batteryCapacity));
        const chargingTimeMinutes = chargingTimeHours * 60;
        
        // Calculate efficiency score (higher is better)
        // Start with base score and subtract penalties, add bonuses
        const efficiencyScore = 
          1000 -                                                   // Base positive score
          (detourDistance * 50) -                                  // HEAVY detour penalty - route efficiency is TOP priority
          (distanceFromRoute * 2) -                                // Distance from route penalty (reduced)
          (chargingTimeMinutes * 0.1) -                            // Charging time penalty (reduced)
          (distanceFromStart > maxDistanceBeforeCharging * 0.9 ? 20 : 0) + // Penalty for cutting it close
          ((station.numberOfPoints || 1) * 5) +                   // Bonus for more charging points
          (maxPowerKW > 100 ? 10 : 0) +                           // Bonus for fast charging
          (maxPowerKW > 200 ? 5 : 0);                             // Extra bonus for ultra-fast charging
        
        return {
          ...station,
          distanceFromStart: Math.round(distanceFromStart * 10) / 10,
          distanceToEnd: Math.round(distanceToEnd * 10) / 10,
          totalDistanceViaStation: Math.round(totalDistanceViaStation * 10) / 10,
          detourDistance: Math.round(detourDistance * 10) / 10,
          distanceFromRoute: Math.round(distanceFromRoute * 10) / 10,
          maxPowerKW,
          estimatedChargingTimeMinutes: Math.round(chargingTimeMinutes),
          efficiencyScore: Math.round(efficiencyScore * 10) / 10,
          remainingRangeAtDestination: Math.round((parseFloat(batteryRange) - distanceToEnd) * 10) / 10
        };
      })
      .sort((a, b) => b.efficiencyScore - a.efficiencyScore) // Higher score is better
      .slice(0, 5); // Top 5 options

    if (scoredStations.length === 0) {
      return res.json({
        needsCharging: true,
        chargingStation: null,
        error: "No suitable charging stations found within range",
        totalDistance: Math.round(totalDistance * 10) / 10,
        currentRange: Math.round(currentRange * 10) / 10
      });
    }

    const bestStation = scoredStations[0];
    
    // Calculate timing details
    const avgSpeed = 80; // km/h average speed
    const timeToStation = (bestStation.distanceFromStart / avgSpeed) * 60; // minutes
    const timeFromStation = (bestStation.distanceToEnd / avgSpeed) * 60; // minutes
    const totalTravelTime = timeToStation + bestStation.estimatedChargingTimeMinutes + timeFromStation;

    res.json({
      needsCharging: true,
      chargingStation: bestStation,
      alternatives: scoredStations.slice(1),
      routeDetails: {
        originalDistance: Math.round(totalDistance * 10) / 10,
        totalDistanceViaStation: bestStation.totalDistanceViaStation,
        detourDistance: bestStation.detourDistance,
        currentRange: Math.round(currentRange * 10) / 10,
        remainingRangeAtDestination: bestStation.remainingRangeAtDestination,
        timeToStation: Math.round(timeToStation),
        timeFromStation: Math.round(timeFromStation),
        chargingTime: bestStation.estimatedChargingTimeMinutes,
        totalTravelTime: Math.round(totalTravelTime),
        originalTravelTime: Math.round((totalDistance / avgSpeed) * 60)
      }
    });

  } catch (err) {
    console.error("Error finding charging stop:", err);
    res.status(500).json({
      error: "Failed to find charging stop",
      details: err.message,
    });
  }
});

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT} - Mode: ${USE_DATABASE ? 'Database' : 'API'}`);
  if (USE_DATABASE && db) {
    console.log(`Database ready with ${db.getStationCount()} stations available`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down database');
  server.close(() => {
    if (db) {
      db.close();
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down database');
  server.close(() => {
    if (db) {
      db.close();
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});