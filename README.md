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


## Database
This project uses SQLite as its database for storing charging station info from Open Charge Map.

### Schema

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