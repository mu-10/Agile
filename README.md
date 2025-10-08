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
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Database Setup

### Initial Setup

1. Populate the database:
```bash
# Download and store charging station data from Open Charge Map API
npm run migrate
```

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

## Functionality

### Automatic charging station recommending

The charging station recommendation system uses a multi-step algorithm to find optimal charging locations:

**Route Analysis**: Calculates total trip distance using Google Maps Directions API for accurate road distances.

**Strategic Charging Point**: Determines optimal charging waypoint at 75% of battery range (25% remaining), maximizing driving efficiency.

**Station Filtering**: Uses straight-line calculations to quickly identify stations within 30km of the target waypoint.

**Precise Calculations**: Applies Google Maps API to calculate exact road distances from start to station and station to destination.

**Intelligent Scoring**: Ranks stations based on detour distance, battery optimization, charging speed, and total trip time.

**Optimal Selection**: Chooses the station with the highest efficiency score, minimizing detour while ensuring adequate battery reserves for journey completion.


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