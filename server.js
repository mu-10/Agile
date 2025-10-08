require('dotenv').config({ quiet: true });
const express = require("express");
const cors = require("cors");
const ChargingStationDB = require('./database/database');
const { findRecommendedChargingStation, calculateDistance } = require('./recommended-charging');
const app = express();

app.use(cors());
app.use(express.json());

// Initialize database connection (database-only mode)
let db;
try {
  db = new ChargingStationDB();
  const stationCount = db.getStationCount();
  
  if (stationCount === 0) {
    console.log('WARNING: No stations in database. Run "npm run migrate" to populate the database.');
  }
} catch (error) {
  console.error('Database connection failed:', error);
  console.log('Server will start but database operations will fail until database is properly set up.');
}

app.get("/api/charging-stations", async (req, res) => {
  try {
    // Check if database is available
    if (!db) {
      return res.status(503).json({
        error: "Database not available",
        message: "The charging station database is not properly set up. Please run 'npm run migrate' to populate the database with charging station data.",
        setup_instructions: "See README.md for detailed setup instructions."
      });
    }

    // Get bounds from query parameters
    const { north, south, east, west } = req.query;
    let { maxResults = 10000 } = req.query;
    maxResults = Math.min(parseInt(maxResults), 10000);
    
    let stations = [];
    
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
      
      if (stations.length === 0) {
        return res.status(404).json({
          error: "No charging station data found",
          message: "The database appears to be empty. Please run 'npm run migrate' to populate the database with charging station data.",
          setup_instructions: "See README.md for detailed setup instructions."
        });
      }
      
      res.json(stations);
    } catch (dbError) {
      console.error('Database query failed:', dbError);
      res.status(500).json({
        error: "Database query failed",
        message: "Failed to retrieve charging station data from database. Please ensure the database is properly set up.",
        setup_instructions: "See README.md for detailed setup instructions.",
        details: dbError.message
      });
    }
  } catch (err) {
    console.error("Backend error:", err);
    res.status(500).json({
      error: "Server error",
      message: "An unexpected error occurred while processing your request.",
      details: err.message,
    });
  }
});

// New endpoint for finding optimal charging station for a route
app.post("/api/find-charging-stop", async (req, res) => {
  try {
    // Check if database is available
    if (!db) {
      return res.status(503).json({
        error: "Database not available",
        message: "The charging station database is not properly set up. Please run 'npm run migrate' to populate the database with charging station data.",
        setup_instructions: "See README.md for detailed setup instructions."
      });
    }

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

    // Get stations from database
    let stations = [];
    const start = { lat: parseFloat(startLat), lng: parseFloat(startLng) };
    const end = { lat: parseFloat(endLat), lng: parseFloat(endLng) };

    try {
      // Get stations from database in a corridor around the route
      const bufferDegrees = 0.3; // 30km buffer
      const north = Math.max(start.lat, end.lat) + bufferDegrees;
      const south = Math.min(start.lat, end.lat) - bufferDegrees;
      const east = Math.max(start.lng, end.lng) + bufferDegrees;
      const west = Math.min(start.lng, end.lng) - bufferDegrees;
      
      console.log(`🗺️ Route bounds: North: ${north}, South: ${south}, East: ${east}, West: ${west}`);
      console.log(`🗺️ Start: ${start.lat}, ${start.lng} | End: ${end.lat}, ${end.lng}`);
      
      stations = db.getStationsInBounds(north, south, east, west, 2000);
      
      console.log(`🔍 Found ${stations.length} stations in route bounds`);
      
      if (stations.length === 0) {
        return res.status(404).json({
          error: "No charging stations found in route area",
          message: "No charging stations found in the database for your route area. The database may be empty or not properly populated.",
          setup_instructions: "See README.md for detailed setup instructions."
        });
      }
    } catch (dbError) {
      console.error("❌ Database query failed:", dbError);
      return res.status(500).json({
        error: "Database query failed",
        message: "Failed to retrieve charging station data from database. Please ensure the database is properly set up.",
        setup_instructions: "See README.md for detailed setup instructions.",
        details: dbError.message
      });
    }

    const result = await findRecommendedChargingStation(
      start,                    // { lat, lng }
      end,                      // { lat, lng }
      batteryRange,             // string/number
      batteryCapacity,          // string/number  
      stations,                 // array of stations
      process.env.GOOGLE_MAPS_API_KEY
    );
    
    // Transform the response to match frontend expectations
    if (result.success && result.station) {
      const response = {
        needsCharging: true,
        chargingStation: result.station,
        alternatives: result.alternatives || [],
        totalDistance: result.totalDistance,
        chargingWaypoint: result.chargingWaypoint,
        message: result.message
      };
      res.json(response);
    } else {
      // No charging needed or error case
      const response = {
        needsCharging: false,
        chargingStation: null,
        alternatives: [],
        message: result.message || "No charging stop needed for this route"
      };
      res.json(response);
    }

  } catch (err) {
    console.error("Error finding charging stop:", err);
    res.status(500).json({
      error: "Failed to find charging stop",
      message: "An unexpected error occurred while finding charging stations.",
      details: err.message,
    });
  }
});

const server = app.listen(3001, () => {
  console.log(`Backend running on http://localhost:3001`);
  if (db) {
    console.log(`Database ready with ${db.getStationCount()} stations available`);
  } else {
    console.log(`Database not available - run 'npm run migrate' to set up charging station data`);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}, shutting down database`);
  
  // Set a timeout to force exit if graceful shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    console.log('Force exiting due to timeout');
    process.exit(1);
  }, 5000); // 5 second timeout
  
  server.close(() => {
    if (db) {
      try {
        db.close();
        console.log('Database connection closed');
      } catch (error) {
        console.log('Error closing database:', error.message);
      }
    }
    clearTimeout(forceExitTimeout);
    console.log('Server shutdown complete');
    process.exit(0);
  });
  
  // Also handle if server.close() doesn't work
  setTimeout(() => {
    console.log('Server close timeout, forcing exit');
    process.exit(1);
  }, 3000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));