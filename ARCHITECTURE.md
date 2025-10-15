# Charging Logic Architecture - Separation of Concerns

## Overview
This document outlines how the charging logic is properly separated between backend and frontend, following the same patterns as the test file.

## Backend Responsibilities (server.js + chargingRecommendationService.js)

### ✅ What Backend Handles:
1. **Core Charging Logic** - Same algorithm as `test_charging_logic.js`
2. **Station Data Management** - Database queries and filtering
3. **Route Calculation** - Google Maps API integration
4. **Distance Calculations** - Haversine and actual route distances
5. **Station Proximity Analysis** - Mapping stations to routes
6. **Multi-stop Planning** - Greedy algorithm for multiple charging stops
7. **Reachability Validation** - Battery range vs actual driving distance

### 🔧 Key Backend Functions:
```javascript
// Same function signature as test file
findRecommendedChargingStation(start, end, batteryRange, batteryCapacity, stations, googleMapsApiKey)

// Route analysis and station mapping
mapStationsToRoute(routePoints, cumKm, stations, maxDeviationKm)
planGreedyStops(params)
projectPointOntoRoute(routePoints, cumKm, point)

// Database operations
ChargingStationDB.getStationsInBounds(north, south, east, west, maxResults)
ChargingStationDB.getAllStations(maxResults)
```

### 🌐 Backend API Endpoints:
- `POST /api/find-charging-stop` - Main charging recommendation (same logic as test file)
- `POST /api/validate-station-reachability` - Check if station is reachable
- `GET /api/charging-stations` - Get stations in map bounds

## Frontend Responsibilities (Map.web.tsx + index.tsx)

### ✅ What Frontend Handles:
1. **User Interface** - Input forms, maps, station markers
2. **API Communication** - Calling backend endpoints with proper data
3. **Route Visualization** - Displaying routes and waypoints on Google Maps
4. **User Interactions** - Station selection, alternative options
5. **State Management** - UI state, loading indicators, error handling
6. **Map Controls** - Zoom, bounds changes, marker clustering

### 🎨 Key Frontend Functions:
```typescript
// API calls (no business logic)
findChargingStop(startCoords, endCoords) - Calls backend API
checkStationReachability(station, batteryRange) - Calls backend API
findChargingStationRecommendation() - Calls backend API

// UI management
calculateChargingRoute(station, startCoords, endCoords) - For visualization only  
calculateMultiStopRoute(chargingStops, startCoords, endCoords) - For visualization only
fetchStationsInBounds(mapInstance) - For map display
```

### ❌ What Frontend Does NOT Do:
- ❌ Charging algorithm calculations
- ❌ Station proximity analysis
- ❌ Route distance calculations
- ❌ Multi-stop planning logic
- ❌ Database queries
- ❌ Complex business logic

## Test File Pattern Implementation

### Original Test Pattern:
```javascript
// test_charging_logic.js
const result = await findRecommendedChargingStation(
  start,           // { lat, lng }
  end,             // { lat, lng }
  batteryRange,    // number (km)
  batteryCapacity, // number (km)
  stations,        // array (empty in test, from DB in backend)
  googleMapsApiKey // string
);
```

### Backend Implementation:
```javascript
// server.js - POST /api/find-charging-stop
const result = await findRecommendedChargingStation(
  start,                              // { lat, lng } - same format
  end,                                // { lat, lng } - same format  
  parseFloat(batteryRange),           // number - same type
  parseFloat(batteryCapacity),        // number - same type
  stations,                           // array - from database instead of empty
  config.external.googleMapsApiKey    // string - same as test
);
```

### Frontend Implementation:
```typescript
// Map.web.tsx - API call only
const response = await fetch('/api/find-charging-stop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    startLat: startCoords.lat,
    startLng: startCoords.lng,
    endLat: endCoords.lat,
    endLng: endCoords.lng,
    batteryRange: batteryRange,
    batteryCapacity: batteryCapacity
  })
});
```

## Data Flow

```
User Input (Frontend)
       ↓
API Request (Frontend → Backend)
       ↓
Database Query (Backend)
       ↓
Charging Algorithm (Backend - same as test file)
       ↓
API Response (Backend → Frontend)  
       ↓
UI Update (Frontend)
```

## Testing Strategy

### 1. Unit Tests (Backend)
- Test `findRecommendedChargingStation` directly (like `test_charging_logic.js`)
- Test individual algorithm components
- Test with different station datasets

### 2. Integration Tests  
- Test API endpoints with real requests
- Test database operations
- Test Google Maps integration

### 3. Frontend Tests
- Test API communication
- Test UI state management  
- Test user interactions

## Benefits of This Architecture

### ✅ Advantages:
1. **Single Source of Truth** - All charging logic in backend
2. **Testability** - Easy to test business logic separately
3. **Maintainability** - Changes only need to be made in one place
4. **Scalability** - Backend can serve multiple clients
5. **Security** - Sensitive logic and API keys protected
6. **Performance** - Database operations on server side
7. **Consistency** - Same algorithm everywhere (test, backend, frontend)

### 🔄 Future Improvements:
1. Add caching for repeated route requests
2. Implement WebSocket for real-time updates
3. Add batch processing for multiple routes
4. Implement more sophisticated routing algorithms
5. Add machine learning for charging recommendations

## Running Tests

```bash
# Test the charging service directly (like original test)
node test_charging_logic.js

# Test integration between all components
node test_integration.js

# Start backend server
node server.js

# Check API health
curl http://localhost:4000/api/charging-stations?maxResults=1
```

## Configuration

All configuration is centralized in `/config/`:
- `appConfig.ts` - Frontend configuration
- `index.js` - Backend configuration  
- Environment variables in `.env`

This ensures consistent API endpoints and settings across the entire application.