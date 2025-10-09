# Chargify

## Electric Vehicle Planner
A project made for course DAT257 Agile software project management.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the backend:

   ```bash
   # Start backend
   npm run server
   ```

3. Start the app

   ```bash
   npx expo start --web
   ```

## Initial Setup
1. API keys needed:
   - [Google Maps API](https://developers.google.com/maps) with access to: 
      - Directions API
      - Maps JavaScript API
      - Routes API
      - Places API
   - [Open Charge Map API](https://openchargemap.org/site/develop/api)

2. Add API Keys in a .env file

3. Populate the database:
   ```bash
   npm run migrate
   ```
   Downloads and stores charging station data from Open Charge Map API

## Functionality

### Automatic charging station recommending

The charging station recommendation system uses a multi-step algorithm to find optimal charging locations:

- **Route Analysis**: Calculates the total trip distance using the Google Maps Directions API for accurate road distances.

- **Imaginary Charging Point**: Determines an initial charging waypoint at 80% of battery range (20% remaining). This point is used as a target for optimal charging.

- **Step-Back Search**: If no station is found at the imaginary point, the algorithm steps back along the route, checking each route segment for nearby stations.

- **2km Radius Filtering**: At each step, stations within a 2km straight-line radius are considered as candidates.

- **Straight-Line & Route Validation**: First, straight-line distance is used for quick filtering. Then, the Google Maps API is used to validate actual road distance from start to station and station to destination.

- **Scoring System**: Each candidate station is scored based on detour distance, battery optimization, charging speed, number of charging points, and total trip time. The scoring system heavily penalizes detours and rewards stations with minimal detour and high battery remaining.

- **Optimal Selection**: The station with the highest efficiency score is selected, ensuring minimal detour and sufficient battery reserves to complete the journey.


## Testing

### Running Tests

```bash
npm test
```

### What the Tests Cover

- **Map Component**: Google Maps integration, location services, and route planning
- **API Mocking**: External charging station API calls and geolocation services
- **Component Rendering**: Ensures map, markers, and directions display correctly
- **Error Handling**: Tests component behavior with missing props and API failures

Tests use Jest with React Testing Library and comprehensive mocks for Google Maps API.


### Database Schema

```sql
CREATE TABLE charging_stations (
  id INTEGER PRIMARY KEY,
  title TEXT,
  address TEXT,
  town TEXT,
  state TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  number_of_points INTEGER,
  status_type TEXT,
  operator TEXT,
  usage_cost TEXT,
  connections TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```