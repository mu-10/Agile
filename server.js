//Get all charging stations from local database

require('dotenv').config({ quiet: true });
require('dotenv').config({ quiet: true });
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const ChargingStationDB = require('./database');
const app = express();

app.use(cors());

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

const server = app.listen(3001, () => {
  console.log(`Backend running on http://localhost:3001 - Mode: ${USE_DATABASE ? 'Database' : 'API'}`);
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