import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_ENDPOINTS, MAPS_CONFIG, UI_CONFIG } from "../config/appConfig";
import { connectorTypes as staticConnectorTypes } from "../services/stationConnectors";
import ConnectorTypeDropdown from "./ConnectorTypeDropdown";
import RouteInfoCard from "./RouteInfoCard";
import StationInfoWindow from "./StationInfoWindow";

// Add CSS animation for loading spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

type Props = {
  onLocationChange: (loc: { lat: number; lng: number }) => void;
  start: string; // can be coordinates or address
  end: string;
  // Optional: if caller has selected exact Google place predictions
  originPlaceId?: string;
  destinationPlaceId?: string;
  batteryRange: number;
  batteryCapacity: number;
  onMapsReady?: () => void; // notify parent when Maps JS is ready (web)
  showRecommendedLocations?: boolean; // whether to show recommended charging stations
  mapStyle?: any; // Accepts Google Maps style array
};

const chargingIcon = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";

// Move libraries outside component to avoid reload warning
const GOOGLE_MAPS_LIBRARIES = MAPS_CONFIG.libraries as unknown as ("places" | "geometry")[];

export default function MapWeb({
  onLocationChange,
  start,
  end,
  originPlaceId,
  destinationPlaceId,
  batteryRange,
  batteryCapacity,
  onMapsReady,
  showRecommendedLocations = true, // default to showing recommended locations
  mapStyle,
}: Props) {
  const [showConnectorDropdown, setShowConnectorDropdown] = useState(false);
  const [connectorTypes] = useState<string[]>(staticConnectorTypes);
  const [selectedConnectorTypes, setSelectedConnectorTypes] = useState<string[]>(staticConnectorTypes);

  // Handler for checkbox change
  const handleConnectorTypeChange = (type: string) => {
    setSelectedConnectorTypes(prev => {
      if (prev.includes(type)) {
        // Remove type
        return prev.filter(t => t !== type);
      } else {
        // Add type
        return [...prev, type];
      }
    });
  };
  const [currentLocation, setCurrentLocation] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);
  const [autoSelectedChargingStation, setAutoSelectedChargingStation] = useState<any | null>(null); // Auto-selected charging station
  const [chargingStopInfo, setChargingStopInfo] = useState<any | null>(null); // Charging stop route details


  const [loadingChargingStop, setLoadingChargingStop] = useState<boolean>(false);
  const [showChargingRoute, setShowChargingRoute] = useState<boolean>(false); // Show charging route UI
  const [stableBestStation, setStableBestStation] = useState<any | null>(null); // Stable auto-selected station
  const [alternativeStations, setAlternativeStations] = useState<any[]>([]); // Alternative charging stations
  const [allChargingStops, setAllChargingStops] = useState<any[]>([]); // All charging stops for multi-stop routes
  const [showAlternatives, setShowAlternatives] = useState<boolean>(false); // Show alternative stations
  const [showChargingPanels, setShowChargingPanels] = useState<boolean>(false); // Stable UI state
  const [cachedRouteKey, setCachedRouteKey] = useState<string>(""); // Cache key for route
  // Removed unused routeStationsFetched
  const [needsChargingStations, setNeedsChargingStations] = useState<boolean>(false); // Track if we need to find charging stations
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [backendError, setBackendError] = useState<boolean>(false);

  const [directionsResponse, setDirectionsResponse] =
    useState<google.maps.DirectionsResult | null>(null);
  const [chargingRouteResponse, setChargingRouteResponse] = 
    useState<google.maps.DirectionsResult | null>(null);
  const [alternativeRoutes, setAlternativeRoutes] = useState<google.maps.DirectionsResult[]>([]);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [totalDistance, setTotalDistance] = useState<string | null>(null);
  const [totalDuration, setTotalDuration] = useState<string | null>(null);
  const [routeSegmentsReady, setRouteSegmentsReady] = useState<boolean>(false);

  // store the initial map center so it doesn't keep re-centering
  const initialCenter = useRef<google.maps.LatLngLiteral | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY!,
    libraries: GOOGLE_MAPS_LIBRARIES, // Use static array to avoid reload warning
  });

  // Reuse a single DirectionsService instance
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(
    null
  );

  // Helper to parse "lat,lng" strings
  const parseLatLng = useCallback(
    (val: string): google.maps.LatLngLiteral | null => {
      const parts = val.split(",");
      if (parts.length !== 2) return null;
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      return null;
    },
    []
  );

  // Function to find optimal charging stop automatically
  const findChargingStop = useCallback(async (
    startCoords: google.maps.LatLngLiteral,
    endCoords: google.maps.LatLngLiteral
  ) => {
    
    setLoadingChargingStop(true);
    try {
      const requestBody = {
        startLat: startCoords.lat,
        startLng: startCoords.lng,
        endLat: endCoords.lat,
        endLng: endCoords.lng,
        batteryRange,
        batteryCapacity,
        connectorTypes: selectedConnectorTypes // Send selected connector types to backend
      };
      
      console.log('=== FRONTEND REQUEST ===');
      console.log('Sending to backend:', JSON.stringify(requestBody, null, 2));
      console.log('API endpoint:', API_ENDPOINTS.findChargingStop());
      
      const response = await fetch(API_ENDPOINTS.findChargingStop(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('=== BACKEND RESPONSE ===');
      console.log('Full response:', JSON.stringify(data, null, 2));
      console.log('needsCharging:', data.needsCharging);
      console.log('chargingStation:', data.chargingStation?.title || 'None');
      console.log('totalDistance:', data.totalDistance);
      console.log('scenario:', data.scenario);
      setChargingStopInfo(data);
      
      // Use backend's Google Maps distance and time instead of frontend calculation
      if (data.totalDistance && typeof data.totalDistance === 'number') {
        console.log('Using backend distance:', data.totalDistance, 'km');
        setDistance(`${data.totalDistance} km`);
      }
      
      if (data.estimatedTime && typeof data.estimatedTime === 'number') {
        console.log('Using backend time:', data.estimatedTime, 'minutes');
        const hours = Math.floor(data.estimatedTime / 60);
        const minutes = data.estimatedTime % 60;
        if (hours > 0) {
          setDuration(`${hours}h ${minutes} min`);
        } else {
          setDuration(`${minutes} min`);
        }
      }
      
      if (data.needsCharging) {
        if (data.chargingStops && data.chargingStops.length > 0) {
          // Multiple charging stops - use the new algorithm result
          console.log('Multiple charging stops detected:', data.chargingStops.length);
          setAutoSelectedChargingStation(data.chargingStops[0]); // Primary stop
          setAllChargingStops(data.chargingStops); // All stops for display
          setAlternativeStations(data.alternatives || []); // Keep alternatives separate
          setShowChargingRoute(true);
          setShowChargingPanels(true); // Enable charging panels for UI
          
          // Calculate route through multiple charging stops
          await calculateMultiStopRoute(data.chargingStops, startCoords, endCoords);
        } else if (data.chargingStation) {
          // Single charging stop (backward compatibility)
          console.log('Single charging stop detected');
          setAutoSelectedChargingStation(data.chargingStation);
          setAllChargingStops([data.chargingStation]); // Single stop in array
          setAlternativeStations(data.alternatives || []);
          setShowChargingRoute(true);
          setShowChargingPanels(true); // Enable charging panels for UI
          
          // Calculate route via single charging station
          await calculateChargingRoute(data.chargingStation, startCoords, endCoords);
        } else {
          setAutoSelectedChargingStation(null);
          setAllChargingStops([]);
          setShowChargingRoute(false);
          setShowChargingPanels(false);
          setChargingRouteResponse(null);
        }
      } else {
        setAutoSelectedChargingStation(null);
        setAllChargingStops([]);
        setShowChargingRoute(false);
        setShowChargingPanels(false);
        setChargingRouteResponse(null);
        setAlternativeRoutes([]);
        setRouteSegmentsReady(false);
        setAlternativeRoutes([]);
        setRouteSegmentsReady(false);
      }
      
      setBackendError(false);
    } catch (error) {
      console.error("Error finding charging stop:", error);
      setChargingStopInfo(null);
      setAutoSelectedChargingStation(null);
      setAllChargingStops([]);
      setShowChargingRoute(false);
      setShowChargingPanels(false);
      setAlternativeRoutes([]);
      setRouteSegmentsReady(false);
      setBackendError(true);
    } finally {
      setLoadingChargingStop(false);
    }
  }, [batteryRange, batteryCapacity]);

  // Function to calculate route via charging station
  const calculateChargingRoute = useCallback(async (
    station: any, 
    startCoords: google.maps.LatLngLiteral, 
    endCoords: google.maps.LatLngLiteral
  ) => {
    if (!directionsServiceRef.current) return;
    try {
      const chargingStationCoords = { lat: station.latitude, lng: station.longitude };
      let routeToStation: any = null;
      let routeFromStation: any = null;

      // Calculate route from start to charging station
      await new Promise<void>((resolve, reject) => {
        directionsServiceRef.current!.route(
          {
            origin: startCoords,
            destination: chargingStationCoords,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === "OK" && result) {
              routeToStation = result;
              resolve();
            } else {
              console.error("Route to charging station failed:", status);
              reject(new Error(`Route calculation failed: ${status}`));
            }
          }
        );
      });

      // Calculate route from charging station to destination
      await new Promise<void>((resolve, reject) => {
        directionsServiceRef.current!.route(
          {
            origin: chargingStationCoords,
            destination: endCoords,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === "OK" && result) {
              routeFromStation = result;
              setChargingRouteResponse(result);
              resolve();
            } else {
              console.error("Route from charging station failed:", status);
              reject(new Error(`Route calculation failed: ${status}`));
            }
          }
        );
      });

      // Calculate route details if both routes are available
      if (routeToStation && routeFromStation) {
        // Update the main direction response to show route to charging station
        setDirectionsResponse(routeToStation);
        
        // Set the route from charging station for second leg display
        setChargingRouteResponse(routeFromStation);
        
        const legToStation = routeToStation.routes[0].legs[0];
        const legFromStation = routeFromStation.routes[0].legs[0];
        
        const timeToStation = legToStation.duration?.value || 0; // in seconds
        const timeFromStation = legFromStation.duration?.value || 0; // in seconds
        const chargingTime = (station.estimatedChargingTimeMinutes || 30) * 60; // convert to seconds
        
        const totalTravelTime = Math.round((timeToStation + timeFromStation + chargingTime) / 60); // in minutes
        const originalTravelTime = duration ? parseInt(duration.replace(/\D/g, '')) : Math.round((timeToStation + timeFromStation) / 60);
        
        const routeDetails = {
          totalTravelTime,
          originalTravelTime,
          totalDistanceViaStation: station.totalDistanceViaStation || ((legToStation.distance?.value || 0) + (legFromStation.distance?.value || 0)) / 1000,
          detourDistance: station.detourDistance || 0,
          actualDetour: station.actualDetour || station.detourDistance || 0, // Use actualDetour if available
          routingSuccess: station.routingSuccess || false,
          timeToStation: Math.round(timeToStation / 60),
          timeFromStation: Math.round(timeFromStation / 60),
          chargingTime: Math.round(chargingTime / 60),
          originalDistance: legToStation.distance?.text || '',
          distanceToEnd: legFromStation.distance?.text || '',
          remainingRangeAtDestination: station.remainingRangeAtDestination || 'Unknown'
        };

        // Update chargingStopInfo with route details
        setChargingStopInfo((prev: any) => ({
          ...prev,
          routeDetails
        }));

        // Update distance/duration to show total trip
        setDistance(`${Math.round(routeDetails.totalDistanceViaStation)} km`);
        setDuration(`${routeDetails.totalTravelTime} min`);
      }
    } catch (error) {
      console.error("Error calculating charging route:", error);
    }
  }, [duration]);

  // Function to calculate route through multiple charging stops
  const calculateMultiStopRoute = useCallback(async (
    chargingStops: any[],
    startCoords: google.maps.LatLngLiteral, 
    endCoords: google.maps.LatLngLiteral
  ) => {
    if (!directionsServiceRef.current || !chargingStops || chargingStops.length === 0) return;
    
    try {
      console.log(`Calculating route through ${chargingStops.length} charging stops`);
      
      // Clear previous routes to avoid flickering
      setRouteSegmentsReady(false);
      setAlternativeRoutes([]);
      setChargingRouteResponse(null);
      
      if (chargingStops.length === 1) {
        // Single charging stop - use the existing single-stop logic for better visualization
        await calculateChargingRoute(chargingStops[0], startCoords, endCoords);
        setRouteSegmentsReady(true);
        return;
      }
      
      // For multiple stops, calculate individual segments
      const routeSegments: google.maps.DirectionsResult[] = [];
      let totalDist = 0;
      let totalDur = 0;
      
      // Calculate route from start to first charging stop
      const firstStopRoute = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
        directionsServiceRef.current!.route(
          {
            origin: startCoords,
            destination: { lat: chargingStops[0].latitude, lng: chargingStops[0].longitude },
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === "OK" && result) {
              resolve(result);
            } else {
              reject(new Error(`Route to first charging stop failed: ${status}`));
            }
          }
        );
      });
      
      routeSegments.push(firstStopRoute);
      if (firstStopRoute.routes[0].legs[0].distance) {
        totalDist += firstStopRoute.routes[0].legs[0].distance.value;
      }
      if (firstStopRoute.routes[0].legs[0].duration) {
        totalDur += firstStopRoute.routes[0].legs[0].duration.value;
      }
      
      // Calculate routes between charging stops
      for (let i = 0; i < chargingStops.length - 1; i++) {
        const segmentRoute = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
          directionsServiceRef.current!.route(
            {
              origin: { lat: chargingStops[i].latitude, lng: chargingStops[i].longitude },
              destination: { lat: chargingStops[i + 1].latitude, lng: chargingStops[i + 1].longitude },
              travelMode: google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
              if (status === "OK" && result) {
                resolve(result);
              } else {
                reject(new Error(`Route between charging stops ${i} and ${i + 1} failed: ${status}`));
              }
            }
          );
        });
        
        routeSegments.push(segmentRoute);
        if (segmentRoute.routes[0].legs[0].distance) {
          totalDist += segmentRoute.routes[0].legs[0].distance.value;
        }
        if (segmentRoute.routes[0].legs[0].duration) {
          totalDur += segmentRoute.routes[0].legs[0].duration.value;
        }
      }
      
      // Calculate route from last charging stop to destination
      const lastStopRoute = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
        directionsServiceRef.current!.route(
          {
            origin: { lat: chargingStops[chargingStops.length - 1].latitude, lng: chargingStops[chargingStops.length - 1].longitude },
            destination: endCoords,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === "OK" && result) {
              resolve(result);
            } else {
              reject(new Error(`Route from last charging stop failed: ${status}`));
            }
          }
        );
      });
      
      routeSegments.push(lastStopRoute);
      if (lastStopRoute.routes[0].legs[0].distance) {
        totalDist += lastStopRoute.routes[0].legs[0].distance.value;
      }
      if (lastStopRoute.routes[0].legs[0].duration) {
        totalDur += lastStopRoute.routes[0].legs[0].duration.value;
      }
      
      console.log('Multi-stop route segments calculated successfully');
      console.log(`Total route segments: ${routeSegments.length}`);
      console.log(`First segment: Start → ${chargingStops[0].title || 'Stop 1'}`);
      console.log(`Last segment: ${chargingStops[chargingStops.length - 1].title || 'Last Stop'} → End`);
      
      // Set the first segment as the main route (blue color)
      setDirectionsResponse(firstStopRoute);
      
      // Set the last segment as the charging route (green color)
      setChargingRouteResponse(lastStopRoute);
      
      // Store intermediate segments as alternative routes for rendering (orange color)
      if (routeSegments.length >= 3) {
        const intermediateSegments = routeSegments.slice(1, -1);
        console.log(`Setting ${intermediateSegments.length} intermediate segments for orange rendering`);
        intermediateSegments.forEach((segment, index) => {
          console.log(`  Intermediate segment ${index + 1}: ${chargingStops[index].title || `Stop ${index + 1}`} → ${chargingStops[index + 1].title || `Stop ${index + 2}`}`);
        });
        setAlternativeRoutes(intermediateSegments);
      } else {
        console.log('No intermediate segments (less than 3 total segments)');
        setAlternativeRoutes([]);
      }
      
      // Add estimated charging time for each stop
      const totalChargingTime = chargingStops.length * 30 * 60; // 30 minutes per stop in seconds
      const totalTravelTime = Math.round((totalDur + totalChargingTime) / 60); // in minutes
      
      console.log(`Total route: ${(totalDist/1000).toFixed(1)}km, ${totalTravelTime}min (including ${chargingStops.length} charging stops)`);
      
      setDistance(`${(totalDist / 1000).toFixed(1)} km`);
      setDuration(`${totalTravelTime} min`);
      
      // Mark route segments as ready
      setRouteSegmentsReady(true);
    } catch (error) {
      console.error("Error calculating multi-stop route:", error);
      // Fallback to single stop route
      if (chargingStops.length > 0) {
        console.log('Falling back to single stop route');
        await calculateChargingRoute(chargingStops[0], startCoords, endCoords);
      }
    }
  }, [calculateChargingRoute]);

  const [stationReachability, setStationReachability] = useState<{[key: string]: {reachable: boolean, message: string}}>({});

  // Function to check if a station is reachable within battery range
  // TODO: This should be moved to backend service with proper route calculation
  const checkStationReachability = useCallback(async (station: any, batteryRange: number) => {
    if (!start) return { reachable: false, message: "No starting point set" };
    
    try {
      // Parse start coordinates from string or extract from current route
      let startCoords = parseLatLng(start);
      
      if (!startCoords && directionsResponse && directionsResponse.routes[0]) {
        const startLocation = directionsResponse.routes[0].legs[0].start_location;
        startCoords = { lat: startLocation.lat(), lng: startLocation.lng() };
      }
      
      if (!startCoords) {
        return { reachable: false, message: "Could not determine starting coordinates" };
      }
      
      // Call backend to validate reachability with actual route calculation
      const response = await fetch(API_ENDPOINTS.validateStationReachability(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startLat: startCoords.lat,
          startLng: startCoords.lng,
          stationLat: station.latitude,
          stationLng: station.longitude,
          batteryRange: batteryRange,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = {
          reachable: data.reachable,
          message: data.message || ""
        };
        
        // Cache the result
        setStationReachability(prev => ({
          ...prev,
          [station.id]: result
        }));
        
        return result;
      } else {
        // Backend validation failed - assume reachable but show warning
        const result = {
          reachable: true,
          message: "Backend validation unavailable - cannot verify reachability"
        };
        
        // Cache the result
        setStationReachability(prev => ({
          ...prev,
          [station.id]: result
        }));
        
        return result;
      }
    } catch (error) {
      console.error('Error validating station reachability:', error);
      const result = { 
        reachable: true, 
        message: "Unable to validate reachability - backend service unavailable" 
      };
      
      // Cache the result
      setStationReachability(prev => ({
        ...prev,
        [station.id]: result
      }));
      
      return result;
    }
  }, [start, parseLatLng, directionsResponse]);

  // Effect to check reachability when a station is selected
  useEffect(() => {
    if (selectedStation && batteryRange && showChargingRoute && chargingStopInfo?.needsCharging) {
      if (!stationReachability[selectedStation.id]) {
        checkStationReachability(selectedStation, batteryRange);
      }
    }
  }, [selectedStation, batteryRange, showChargingRoute, chargingStopInfo, checkStationReachability, stationReachability]);



  // Function to calculate distance from a point to the route path
  const getDistanceToRoute = useCallback((
    stationLat: number,
    stationLng: number,
    route: google.maps.DirectionsResult
  ): number => {
    if (!route || !route.routes[0]) return Infinity;

    const path = route.routes[0].overview_path;
    if (!path || path.length === 0) return Infinity;

    let minDistance = Infinity;
    
    // Check distance to each point in the route path
    for (let i = 0; i < path.length; i++) {
      const routePoint = path[i];
      const distance = google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(stationLat, stationLng),
        routePoint
      );
      
      if (distance < minDistance) {
        minDistance = distance;
      }
      
      // Also check distance to line segments between consecutive points
      if (i < path.length - 1) {
        const nextPoint = path[i + 1];
        const projection = google.maps.geometry.spherical.interpolate(
          routePoint,
          nextPoint,
          0.5 // Check midpoint of segment
        );
        const segmentDistance = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(stationLat, stationLng),
          projection
        );
        
        if (segmentDistance < minDistance) {
          minDistance = segmentDistance;
        }
      }
    }
    
    return minDistance;
  }, []);

  // Enhanced station filter - considers both connector type and route proximity
  const filteredStations = useMemo(() => {
    if (selectedConnectorTypes.length === 0) {
      return [];
    }
    
    // Filter by connector type first
    let filtered = stations.filter(station =>
      station.connections && station.connections.some((conn: any) => selectedConnectorTypes.includes(conn.type))
    );
    
    // Only filter by route proximity if we have routes and they are ready
    if (filtered.length > 0 && routeSegmentsReady && (directionsResponse || alternativeRoutes.length > 0 || chargingRouteResponse)) {
      const PROXIMITY_THRESHOLD = 2000; // 2km in meters
      
      // Collect all routes to check
      const routesToCheck = [];
      if (directionsResponse) routesToCheck.push(directionsResponse);
      if (chargingRouteResponse) routesToCheck.push(chargingRouteResponse);
      routesToCheck.push(...alternativeRoutes);
      
      filtered = filtered.filter(station => {
        // Check if station is close to any route segment
        return routesToCheck.some(route => {
          const distance = getDistanceToRoute(station.latitude, station.longitude, route);
          return distance <= PROXIMITY_THRESHOLD;
        });
      });
    }
    
    return filtered;
  }, [stations, selectedConnectorTypes, directionsResponse, alternativeRoutes, chargingRouteResponse, routeSegmentsReady, getDistanceToRoute]);

  // Function to fetch stations based on map bounds
  const fetchStationsInBounds = useCallback(
    async (mapInstance: google.maps.Map) => {
      const bounds = mapInstance.getBounds();
      if (!bounds) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      // Calculate zoom level to determine how many stations to request
      const zoomLevel = mapInstance.getZoom() || 12;
      let maxResults;
      if (zoomLevel <= 8) {
        maxResults = UI_CONFIG.maxStationsPerRequest.zoomedOut.toString();
      } else if (zoomLevel <= 10) {
        maxResults = UI_CONFIG.maxStationsPerRequest.medium.toString();
      } else {
        maxResults = UI_CONFIG.maxStationsPerRequest.zoomedIn.toString();
      }

      const params = new URLSearchParams({
        north: ne.lat().toString(),
        south: sw.lat().toString(),
        east: ne.lng().toString(),
        west: sw.lng().toString(),
        maxResults,
      });
      // Add connectorTypes to params if any are selected
      if (selectedConnectorTypes.length > 0) {
        params.append('connectorTypes', selectedConnectorTypes.join(','));
      }

      try {
        const response = await fetch(
          API_ENDPOINTS.chargingStations() + `?${params}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const newStations = await response.json();
        setBackendError(false);
        setStations((prevStations) => {
          const newStationsMap = new Map(
            newStations.map((station: any) => [station.id, station])
          );
          const keptStations = prevStations.filter((station) =>
            newStationsMap.has(station.id)
          );
          const keptStationIds = new Set(
            keptStations.map((station) => station.id)
          );
          const addedStations = newStations.filter(
            (station: any) => !keptStationIds.has(station.id)
          );
          const currentBounds = bounds;
          const visibleStations = keptStations.filter((station) => {
            const stationLat = station.latitude;
            const stationLng = station.longitude;
            return (
              stationLat >= sw.lat() &&
              stationLat <= ne.lat() &&
              stationLng >= sw.lng() &&
              stationLng <= ne.lng()
            );
          });
          return [...visibleStations, ...addedStations];
        });
      } catch (error) {
        console.error("Error fetching stations:", error);
        if (error instanceof TypeError && error.message.includes("fetch")) {
          setBackendError(true);
        } else if (
          error instanceof Error &&
          error.message.includes("HTTP error")
        ) {
          setBackendError(true);
        }
      } finally {
        setLoadingStations(false);
      }
    },
    [selectedConnectorTypes]
  );

  // Unified function to fetch stations based on map bounds (always)
  const fetchStations = useCallback(
    (mapInstance: google.maps.Map) => {
      // Always use bounds-based fetching for better performance
      fetchStationsInBounds(mapInstance);
    },
    [fetchStationsInBounds]
  );

  // Debounced bounds change handler for optimal performance
  const debouncedFetchStations = useRef<number | null>(null);
  const onBoundsChanged = useCallback(() => {
    // Don't fetch new stations if we have a route and already fetched stations for it
    // Removed unused routeStationsFetched check
    
    if (map) {
      // Clear previous timeout
      if (debouncedFetchStations.current) {
        clearTimeout(debouncedFetchStations.current);
      }

      // Set new timeout - use configured debounce delay
      debouncedFetchStations.current = setTimeout(() => {
        fetchStations(map);
      }, UI_CONFIG.debounceDelay) as unknown as number;
    }
  }, [map, fetchStations]);

  // Handle map load
  const onLoad = useCallback(
    (mapInstance: google.maps.Map) => {
      setMap(mapInstance);
      // Initial fetch when map loads
      fetchStations(mapInstance);

      // Example: Add charger marker and info window with dark mode support
      const chargerMarker = new window.google.maps.Marker({
        position: { lat: 43.6532, lng: -79.3832 }, // Example charger location
        map: mapInstance,
        icon: {
          url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
        },
      });
      const chargerInfoContent = `<div style="padding:10px;min-width:160px;background:${mapStyle ? '#27272a' : '#fff'};color:${mapStyle ? '#d1d5db' : '#111827'};border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:system-ui,sans-serif;">
        <strong>Charger Info</strong><br />
        Type: Fast<br />
        Status: Available<br />
        Power: 50kW
      </div>`;
      const chargerInfoWindow = new window.google.maps.InfoWindow({
        content: chargerInfoContent,
      });
      chargerMarker.addListener("click", () => {
        chargerInfoWindow.open(mapInstance, chargerMarker);
      });
    },
    [fetchStations, mapStyle]
  );

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentLocation(loc);
          onLocationChange(loc);

          if (!initialCenter.current) {
            initialCenter.current = loc; // only set once
          }
        },
        (err) => {
          console.error("Error getting location:", err);
          const fallback = MAPS_CONFIG.defaultCenter;
          setCurrentLocation(fallback);
          onLocationChange(fallback);

          if (!initialCenter.current) {
            initialCenter.current = fallback; // fallback center
          }
        }
      );
    } else {
      console.error("Geolocation not supported");
      const fallback = MAPS_CONFIG.defaultCenter;
      setCurrentLocation(fallback);
      onLocationChange(fallback);

      if (!initialCenter.current) {
        initialCenter.current = fallback;
      }
    }
  }, [onLocationChange]);

  // Initialize directions service once when Maps is loaded
  useEffect(() => {
    if (!isLoaded) return;
    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new google.maps.DirectionsService();
    }
    // Notify parent once maps are ready
    onMapsReady && onMapsReady();
  }, [isLoaded]);

  // Calculate route whenever inputs change
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!directionsServiceRef.current) {
      return;
    }
    if (!start && !originPlaceId) {
      return; // need at least one origin signal
    }
    if (!end && !destinationPlaceId) {
      return; // need at least one destination signal
    }
    if (!batteryRange || batteryRange <= 0) {
      return; // need valid battery range for charging calculations
    }

    // Build origin param
    let origin:
      | string
      | google.maps.LatLngLiteral
      | { placeId: string }
      | null = null;
    if (originPlaceId) {
      origin = { placeId: originPlaceId };
    } else if (start) {
      const parsed = parseLatLng(start);
      origin = parsed ? parsed : start; // either LatLng or free text
    }

    // Build destination param
    let destination:
      | string
      | google.maps.LatLngLiteral
      | { placeId: string }
      | null = null;
    if (destinationPlaceId) {
      destination = { placeId: destinationPlaceId };
    } else if (end) {
      const parsed = parseLatLng(end);
      destination = parsed ? parsed : end;
    }

    if (!origin || !destination) {
      return;
    }

    // Calculate the route
    directionsServiceRef.current.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      },
      async (result, status) => {
        if (status === "OK" && result) {
          const leg = result.routes[0].legs[0];
          const routeDistance = parseFloat(leg.distance?.text?.replace(/[^\d.]/g, "") || "0");
          
          // Check if charging is needed
          if (routeDistance > batteryRange && batteryRange > 0) {
            
            // Need charging - find optimal charging station
            let startCoords = parseLatLng(start) || (typeof origin === 'object' && 'lat' in origin ? origin : null);
            let endCoords = parseLatLng(end) || (typeof destination === 'object' && 'lat' in destination ? destination : null);
            
            // If we don't have coordinates, extract them from the route result (for manual addresses)
            if (result && result.routes[0] && result.routes[0].legs[0]) {
              if (!startCoords) {
                const startLocation = result.routes[0].legs[0].start_location;
                startCoords = {
                  lat: startLocation.lat(),
                  lng: startLocation.lng()
                };
              }
              
              if (!endCoords) {
                const endLocation = result.routes[0].legs[0].end_location;
                endCoords = {
                  lat: endLocation.lat(),
                  lng: endLocation.lng()
                };
              }
            }
            
            if (startCoords && endCoords) {
              // Don't set directions response yet - let charging stop calculation handle it
              console.log('Frontend Google Maps distance:', leg.distance?.text, 'value:', leg.distance?.value);
              // Don't set distance here - wait for backend response
              // setDistance(leg.distance?.text || null);
              setDuration(leg.duration?.text || null);
              
              // Find charging stop which will set the appropriate route display
              await findChargingStop(startCoords, endCoords);
            } else {
              // Show direct route anyway
              setDirectionsResponse(result);
              // Don't set distance here - wait for backend response
              // setDistance(leg.distance?.text || null);
              setDuration(leg.duration?.text || null);
              setShowChargingRoute(false);
              setAutoSelectedChargingStation(null);
              setAllChargingStops([]);
              setChargingRouteResponse(null);
            }
          } else {
            // No charging needed - use direct route
            setDirectionsResponse(result);
            // Don't set distance here - wait for backend response
            // setDistance(leg.distance?.text || null);
            setDuration(leg.duration?.text || null);
            setShowChargingRoute(false);
            setAutoSelectedChargingStation(null);
            setAllChargingStops([]);
            setChargingRouteResponse(null);
            setAlternativeRoutes([]);
            setRouteSegmentsReady(true);
          }
        } else {
          console.error("Directions request failed:", status);
          setDirectionsResponse(null);
          setDistance(null);
          setDuration(null);
        }
      }
    );
  }, [isLoaded, start, end, originPlaceId, destinationPlaceId, batteryRange, parseLatLng, findChargingStop]);

  // Battery range check
  const exceedsRange =
    distance && batteryRange
      ? parseFloat(distance.replace(/[^\d.]/g, "")) > batteryRange
      : false;

  // State for recommended charging station
  const [recommendedStation, setRecommendedStation] = useState<any | null>(null);
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState<boolean>(false);
  const lastRouteRef = useRef<string | null>(null);

  // Function to find charging station recommendation
  const findChargingStationRecommendation = useCallback(async () => {
    if (!exceedsRange || !start || !end || !batteryRange || !batteryCapacity) {
      setRecommendedStation(null);
      return;
    }

    if (!directionsResponse || !directionsResponse.routes[0]) return;

    // Create a route signature to prevent duplicate calls
    const route = directionsResponse.routes[0];
    const startLocation = route.legs[0].start_location;
    const endLocation = route.legs[route.legs.length - 1].end_location;
    const routeSignature = `${startLocation.lat()},${startLocation.lng()}-${endLocation.lat()},${endLocation.lng()}-${batteryRange}`;
    
    // If we already processed this route, don't call again
    if (lastRouteRef.current === routeSignature) {
      return;
    }
    
    lastRouteRef.current = routeSignature;
    setIsLoadingRecommendation(true);
    
    try {
      const route = directionsResponse.routes[0];
      const startLocation = route.legs[0].start_location;
      const endLocation = route.legs[route.legs.length - 1].end_location;
      
  const response = await fetch(API_ENDPOINTS.findChargingStop(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startLat: startLocation.lat(),
          startLng: startLocation.lng(),
          endLat: endLocation.lat(),
          endLng: endLocation.lng(),
          batteryRange: batteryRange,
          batteryCapacity: batteryCapacity
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.needsCharging && data.chargingStation) {
          setRecommendedStation(data.chargingStation);
          
          // Calculate new route through the charging station
          if (directionsServiceRef.current) {
            const waypoint = {
              location: {
                lat: data.chargingStation.latitude,
                lng: data.chargingStation.longitude
              },
              stopover: true
            };

            let origin: string | google.maps.LatLngLiteral | { placeId: string } | null = null;
            if (originPlaceId) {
              origin = { placeId: originPlaceId };
            } else if (start) {
              const parsed = parseLatLng(start);
              origin = parsed ? parsed : start;
            }

            let destination: string | google.maps.LatLngLiteral | { placeId: string } | null = null;
            if (destinationPlaceId) {
              destination = { placeId: destinationPlaceId };
            } else if (end) {
              const parsed = parseLatLng(end);
              destination = parsed ? parsed : end;
            }

            if (origin && destination) {
              directionsServiceRef.current.route(
                {
                  origin,
                  destination,
                  waypoints: [waypoint],
                  travelMode: google.maps.TravelMode.DRIVING,
                  provideRouteAlternatives: false,
                },
                (result, status) => {
                  if (status === "OK" && result) {
                    setDirectionsResponse(result);
                    
                    // Calculate total distance and duration
                    let totalDist = 0;
                    let totalDur = 0;
                    result.routes[0].legs.forEach(leg => {
                      if (leg.distance) totalDist += leg.distance.value;
                      if (leg.duration) totalDur += leg.duration.value;
                    });
                    
                    setDistance(`${(totalDist / 1000).toFixed(1)} km`);
                    setDuration(`${Math.round(totalDur / 60)} mins`);
                  }
                }
              );
            }
          }
        } else {
          setRecommendedStation(null);
        }
      } else {
        console.error('Failed to get charging recommendation');
        setRecommendedStation(null);
      }
    } catch (error) {
      console.error('Error getting charging recommendation:', error);
      setRecommendedStation(null);
    } finally {
      setIsLoadingRecommendation(false);
    }
  }, [exceedsRange, start, end, batteryRange, batteryCapacity, directionsResponse, originPlaceId, destinationPlaceId, parseLatLng]);

  // Call charging recommendation when route changes and exceeds range
  useEffect(() => {
    if (exceedsRange && directionsResponse) {
      findChargingStationRecommendation();
    } else {
      setRecommendedStation(null);
      lastRouteRef.current = null; // Clear route reference when not needed
    }
  }, [exceedsRange, directionsResponse]);

  // Handle clicking recommended charging station
  const handleRecommendedStationClick = useCallback((station: any) => {
    if (map && station) {
      // Zoom to station location
      map.setCenter({ lat: station.latitude, lng: station.longitude });
      map.setZoom(16);
      
      // Show info window
      setSelectedStation(station);
    }
  }, [map]);

  // Handle clicking any charging station from route info card
  const handleStationClick = useCallback((station: any) => {
    if (map && station && station.latitude && station.longitude) {
      // Center map on the station
      map.setCenter({ lat: station.latitude, lng: station.longitude });
      map.setZoom(16);
      
      // Show info window for this station
      setSelectedStation(station);
    }
  }, [map]);

  if (loadError)
    return <div>Failed to load Google Maps: {String(loadError)}</div>;
  if (!isLoaded || !initialCenter.current) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <div>Loading map...</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {/* Connector type filter button and dropdown */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1001 }}>
        <button
          style={{
            background: '#fff',
            border: '1px solid #dadce0',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            cursor: 'pointer',
            minWidth: 180,
            textAlign: 'left',
          }}
          onClick={() => setShowConnectorDropdown(v => !v)}
        >
          Filter charging stations by connector types
          <span style={{ float: 'right', fontSize: 14, color: '#333' }}>{showConnectorDropdown ? '▲' : '▼'}</span>
        </button>
        {showConnectorDropdown && (
          <div style={{
            position: 'absolute',
            top: 40,
            right: 0,
            background: '#fff',
            border: '1px solid #dadce0',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '12px 16px',
            minWidth: 180,
            maxHeight: 260,
            overflowY: 'auto',
          }}>
            <ConnectorTypeDropdown
              connectorTypes={connectorTypes}
              selectedConnectorTypes={selectedConnectorTypes}
              setSelectedConnectorTypes={setSelectedConnectorTypes}
            />
          </div>
        )}
      </div>
      <GoogleMap
        center={initialCenter.current} //  only set once
        zoom={MAPS_CONFIG.defaultZoom}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        options={{ streetViewControl: false, mapTypeControl: false, styles: mapStyle || undefined }}
        onLoad={onLoad}
        onBoundsChanged={onBoundsChanged}
      >
        {/* User marker */}
        {currentLocation && (
          <Marker position={currentLocation} title="You are here" />
        )}

        {/* Routes */}
        {directionsResponse && (
          <DirectionsRenderer
            directions={directionsResponse}
            options={{ 
              preserveViewport: true,
              polylineOptions: {
                strokeColor: showChargingPanels && allChargingStops.length > 1 ? "#4285F4" : 
                           showChargingPanels && allChargingStops.length === 1 ? "#FF6B35" : "#4285F4", // Blue for first segment to charging stop, orange for single stop, blue for normal routes
                strokeWeight: 6,
                strokeOpacity: 0.8
              },
              markerOptions: {
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: showChargingPanels && allChargingStops.length > 1 ? "#4285F4" : 
                            showChargingPanels && allChargingStops.length === 1 ? "#FF6B35" : "#4285F4",
                  fillOpacity: 1,
                  strokeColor: "#FFFFFF",
                  strokeWeight: 2
                }
              }
            }}
          />
        )}

        {/* Alternative routes - for multi-stop intermediate segments */}
        {alternativeRoutes.map((route, index) => (
          <DirectionsRenderer
            key={`alt-route-${index}`}
            directions={route}
            options={{ 
              preserveViewport: true,
              polylineOptions: {
                strokeColor: showChargingPanels && allChargingStops.length > 1 ? "#FF6B35" : "#87CEEB", // Orange for intermediate charging segments, light blue for regular alternatives
                strokeWeight: showChargingPanels && allChargingStops.length > 1 ? 6 : 4,
                strokeOpacity: showChargingPanels && allChargingStops.length > 1 ? 0.8 : 0.6
              },
              markerOptions: {
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: showChargingPanels && allChargingStops.length > 1 ? 8 : 6,
                  fillColor: showChargingPanels && allChargingStops.length > 1 ? "#FF6B35" : "#87CEEB",
                  fillOpacity: showChargingPanels && allChargingStops.length > 1 ? 1 : 0.8,
                  strokeColor: "#FFFFFF",
                  strokeWeight: showChargingPanels && allChargingStops.length > 1 ? 2 : 1
                }
              }
            }}
          />
        ))}
        
        {/* Second route from charging station to destination */}
        {chargingRouteResponse && (
          <DirectionsRenderer
            directions={chargingRouteResponse}
            options={{ 
              preserveViewport: true,
              polylineOptions: {
                strokeColor: "#34A853", // Green for second leg
                strokeWeight: 6,
                strokeOpacity: 0.8
              },
              markerOptions: {
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#34A853",
                  fillOpacity: 1,
                  strokeColor: "#FFFFFF",
                  strokeWeight: 2
                }
              }
            }}
          />
        )}

        {/* All charging stops markers for multi-stop routes */}
        {showRecommendedLocations && allChargingStops.map((stop, index) => (
          <Marker
            key={`charging-stop-${stop.id}-${index}`}
            position={{
              lat: stop.latitude,
              lng: stop.longitude,
            }}
            title={`Stop ${index + 1}: ${stop.title}`}
            icon={{
              url: index === 0 
                ? "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png" // Yellow for first stop
                : "https://maps.google.com/mapfiles/ms/icons/orange-dot.png", // Orange for additional stops
              scaledSize: new window.google.maps.Size(40, 40),
            }}
            onClick={() => {
              // Set as selected station for info window
              setSelectedStation({...stop});
              
              // Center map on the station
              if (map) {
                map.setCenter({
                  lat: stop.latitude,
                  lng: stop.longitude,
                });
                map.setZoom(16); // Zoom in to show details
              }
            }}
            zIndex={1000 + index} // Ensure proper layering
          />
        ))}

        {/* Legacy auto-selected charging station marker (for backward compatibility) */}
        {showRecommendedLocations && autoSelectedChargingStation && allChargingStops.length === 0 && (
          <Marker
            position={{
              lat: autoSelectedChargingStation.latitude,
              lng: autoSelectedChargingStation.longitude,
            }}
            title={`Recommended: ${autoSelectedChargingStation.title}`}
            icon={{
              url: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png", // Yellow for recommended charging station
              scaledSize: new window.google.maps.Size(40, 40),
            }}
            onClick={() => {
              // Set as selected station for info window
              setSelectedStation(autoSelectedChargingStation);
              
              // Center map on the station
              if (map) {
                map.setCenter({
                  lat: autoSelectedChargingStation.latitude,
                  lng: autoSelectedChargingStation.longitude,
                });
                map.setZoom(16); // Zoom in to show details
              }
            }}
            zIndex={1000} // Ensure it's above other markers
          />
        )}

        {/* Charging station markers - filtered by route proximity */}
        {(() => {
          const stationsToRender = filteredStations;
          
          if (loadingStations) {
            return null;
          }
          
          if (!Array.isArray(stationsToRender) || stationsToRender.length === 0) {
            return null;
          }
          
          return stationsToRender.map((station: any) => {
            // Don't show regular marker if this is the auto-selected station
            if (autoSelectedChargingStation && station.id === autoSelectedChargingStation.id) {
              return null;
            }
            
            return (
              <Marker
                key={station.id}
                position={{ lat: station.latitude, lng: station.longitude }}
                title={station.title}
                icon={{
                  url: chargingIcon, // Back to original green charging icon
                  scaledSize: new window.google.maps.Size(32, 32), // Back to original size
                }}
                onClick={() => {
                  console.log('Regular station clicked:', station.title);
                  setSelectedStation({...station});
                }}
              />
            );
          }).filter(Boolean); // Remove null values
        })()}

        {/* Recommended charging station marker - always show even if not in filtered list */}
        {showRecommendedLocations && recommendedStation && !filteredStations.some(station => station.id === recommendedStation.id) && (
          <Marker
            key={`recommended-${recommendedStation.id}`}
            position={{ lat: recommendedStation.latitude, lng: recommendedStation.longitude }}
            title={`Recommended: ${recommendedStation.title}`}
            icon={{
              url: "https://maps.google.com/mapfiles/ms/icons/orange-dot.png",
              scaledSize: new window.google.maps.Size(48, 48),
            }}
            onClick={() => {
              console.log('Recommended station clicked:', recommendedStation.title);
              setSelectedStation({...recommendedStation});
            }}
          />
        )}

        {/* Station Info Window */}
        <StationInfoWindow
          key={selectedStation ? `station-${selectedStation.id || selectedStation.title}` : 'no-station'}
          station={selectedStation}
          isVisible={!!selectedStation}
          onClose={() => setSelectedStation(null)}
          isRecommended={selectedStation && autoSelectedChargingStation && selectedStation.id === autoSelectedChargingStation.id}
          isDarkMode={!!mapStyle}
        />
      </GoogleMap>

      {/* Route info card */}
      <RouteInfoCard
        distance={distance}
        duration={duration}
        chargingStopInfo={chargingStopInfo}
        allChargingStops={allChargingStops}
        showChargingRoute={showChargingRoute}
        loadingChargingStop={loadingChargingStop}
        batteryRange={batteryRange}
        batteryCapacity={batteryCapacity}
        isDarkMode={!!mapStyle}
        onStationClick={handleStationClick}
      />


      {/* Add CSS for loading spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes slideInFromRight {
          0% { 
            transform: translateX(100%);
            opacity: 0;
          }
          100% { 
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Backend Error */}
      {backendError && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "#fff",
            padding: "12px 16px",
            borderRadius: "8px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            border: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            zIndex: 9999,
            fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
            fontSize: "14px",
            maxWidth: "320px",
          }}
        >
          <div
            style={{
              width: "4px",
              height: "32px",
              backgroundColor: "#ff6b6b",
              borderRadius: "2px",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "500", color: "#333", marginBottom: "2px" }}>
              Backend Offline
            </div>
            <div style={{ color: "#666", fontSize: "12px" }}>
              Charging stations unavailable
            </div>
          </div>
          <button
            onClick={() => setBackendError(false)}
            style={{
              background: "none",
              border: "none",
              color: "#999",
              cursor: "pointer",
              fontSize: "16px",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f5";
              e.currentTarget.style.color = "#333";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#999";
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}