# Chargify

## Electric Vehicle Planner

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the backend
   ```bash
   node server.js
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

## Testing

### Running Tests

```bash
npm test
# or
npx jest
```

### What the Tests Cover

- **Map Component**: Google Maps integration, location services, and route planning
- **API Mocking**: External charging station API calls and geolocation services
- **Component Rendering**: Ensures map, markers, and directions display correctly
- **Error Handling**: Tests component behavior with missing props and API failures

Tests use Jest with React Testing Library and comprehensive mocks for Google Maps API.