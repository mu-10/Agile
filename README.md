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
   # Start backend with database is there is data, otherwise API mode is used
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

## Database

### Database Setup

The application uses SQLite to store charging station data locally for better performance and reliability.

**Update the database:**
```bash
# Migrate data from Open Charge Map API to local database
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