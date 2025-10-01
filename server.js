//Get all charging stations in Sweden using openchargemap API and send them to the front-end

require('dotenv').config({ quiet: true });
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const app = express();

app.use(cors());

// Simple in-memory cache to reduce API calls
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const REQUEST_DELAY = 1000; // 1 second between requests

// Track last request time to implement rate limiting
let lastRequestTime = 0;

// Clean up expired cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Helper function to create cache key from bounds
function createCacheKey(north, south, east, west, maxResults) {
  if (north && south && east && west) {
    return `${north}-${south}-${east}-${west}-${maxResults}`;
  }
  return `sweden-${maxResults}`;
}

// Helper function to wait for rate limit
function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < REQUEST_DELAY) {
    const waitTime = REQUEST_DELAY - timeSinceLastRequest;
    return new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  return Promise.resolve();
}

app.get("/api/charging-stations", async (req, res) => {
  try {
    // Get bounds from query parameters
    const { north, south, east, west, maxResults = 500 } = req.query;
    
    // Create cache key
    const cacheKey = createCacheKey(north, south, east, west, maxResults);
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return res.json(cached.data);
    }
    
    // Wait for rate limit before making API call
    await waitForRateLimit();
    lastRequestTime = Date.now();
    
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
    
    // If rate limited, return a more specific error
    if (err.message.includes('429')) {
      res.status(429).json({
        error: "Rate limited by Open Charge Map API",
        details: "Too many requests. Please wait a moment before trying again.",
        retryAfter: 60 // seconds
      });
    } else {
      res.status(500).json({
        error: "Failed to fetch charging stations",
        details: err.message,
      });
    }
  }
});

app.listen(3001, () => {
  console.log("Backend running on http://localhost:3001");
});