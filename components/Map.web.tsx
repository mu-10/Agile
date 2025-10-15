import {
    DirectionsRenderer,
    GoogleMap,
    InfoWindow,
    Marker,
    useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_ENDPOINTS, DEFAULTS, MAPS_CONFIG, UI_CONFIG } from "../config/appConfig";
import { connectorTypes as staticConnectorTypes } from "../services/stationConnectors";
import ConnectorTypeDropdown from "./ConnectorTypeDropdown";

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
        batteryCapacity
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
          
          // Calculate route through multiple charging stops
          await calculateMultiStopRoute(data.chargingStops, startCoords, endCoords);
        } else if (data.chargingStation) {
          // Single charging stop (backward compatibility)
          console.log('Single charging stop detected');
          setAutoSelectedChargingStation(data.chargingStation);
          setAllChargingStops([data.chargingStation]); // Single stop in array
          setAlternativeStations(data.alternatives || []);
          setShowChargingRoute(true);
          
          // Calculate route via single charging station
          await calculateChargingRoute(data.chargingStation, startCoords, endCoords);
        } else {
          setAutoSelectedChargingStation(null);
          setAllChargingStops([]);
          setShowChargingRoute(false);
          setChargingRouteResponse(null);
        }
      } else {
        setAutoSelectedChargingStation(null);
        setAllChargingStops([]);
        setShowChargingRoute(false);
        setChargingRouteResponse(null);
      }
      
      setBackendError(false);
    } catch (error) {
      console.error("Error finding charging stop:", error);
      setChargingStopInfo(null);
      setAutoSelectedChargingStation(null);
      setAllChargingStops([]);
      setShowChargingRoute(false);
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
      
      // Create waypoints from charging stops
      const waypoints = chargingStops.map(stop => ({
        location: { lat: stop.latitude, lng: stop.longitude },
        stopover: true
      }));

      // Calculate route with multiple waypoints
      await new Promise<void>((resolve, reject) => {
        directionsServiceRef.current!.route(
          {
            origin: startCoords,
            destination: endCoords,
            waypoints: waypoints,
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: false, // Keep the order from the algorithm
          },
          (result, status) => {
            if (status === "OK" && result) {
              console.log('Multi-stop route calculated successfully');
              setDirectionsResponse(result);
              
              // Calculate total distance and duration including charging time
              let totalDist = 0;
              let totalDur = 0;
              result.routes[0].legs.forEach(leg => {
                if (leg.distance) totalDist += leg.distance.value;
                if (leg.duration) totalDur += leg.duration.value;
              });
              
              // Add estimated charging time for each stop (except the last one which is destination)
              const totalChargingTime = chargingStops.length * 30 * 60; // 30 minutes per stop in seconds
              const totalTravelTime = Math.round((totalDur + totalChargingTime) / 60); // in minutes
              
              console.log(`Total route: ${(totalDist/1000).toFixed(1)}km, ${totalTravelTime}min (including ${chargingStops.length} charging stops)`);
              
              setDistance(`${(totalDist / 1000).toFixed(1)} km`);
              setDuration(`${totalTravelTime} min`);
              
              resolve();
            } else {
              console.error("Multi-stop route calculation failed:", status);
              // Fallback to single stop if multi-stop fails
              if (chargingStops.length > 0) {
                calculateChargingRoute(chargingStops[0], startCoords, endCoords);
              }
              reject(new Error(`Multi-stop route calculation failed: ${status}`));
            }
          }
        );
      });
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



  // Helper function to calculate distance from a point to the route path
  const getDistanceToRoute = useCallback(
    (
      stationLat: number,
      stationLng: number,
      route: google.maps.DirectionsResult
    ): number => {
      if (!route || !route.routes[0]) return Infinity;

      const path = route.routes[0].overview_path;
      let minDistance = Infinity;

      // Check distance to each point along the route
      for (let i = 0; i < path.length; i++) {
        const routePoint = path[i];
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(stationLat, stationLng),
          new google.maps.LatLng(routePoint.lat(), routePoint.lng())
        );

        if (distance < minDistance) {
          minDistance = distance;
        }
      }

      return minDistance;
    },
    []
  );

  // Filter stations based on route proximity (only when route exists)
  function filteredStations() {
    if (selectedConnectorTypes.length === 0) {
      return [];
    }
    if (!directionsResponse || !start || !end) {
      // No route planned - show all stations in viewport, but filter by connector type
      return stations.filter(station =>
        station.connections && station.connections.some((conn: any) => selectedConnectorTypes.includes(conn.type))
      );
    }
    // Route exists - show stations within configured distance of route and filter by connector type
    const filtered = stations.filter((station) => {
  const hasSelectedConnector = station.connections && station.connections.some((conn: any) => selectedConnectorTypes.includes(conn.type));
      if (!hasSelectedConnector) return false;
      const distance = getDistanceToRoute(
        station.latitude,
        station.longitude,
        directionsResponse
      );
      return distance <= DEFAULTS.maxStationDistance;
    });
    return filtered;
  }

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
              // Store the original full route for station filtering
              setDirectionsResponse(result);
              console.log('Frontend Google Maps distance:', leg.distance?.text, 'value:', leg.distance?.value);
              // Don't set distance here - wait for backend response
              // setDistance(leg.distance?.text || null);
              setDuration(leg.duration?.text || null);
              
              // Find charging stop (but don't override the main route)
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
                strokeColor: showChargingPanels ? "#FF6B35" : "#4285F4", // Orange for first leg, blue for single route
                strokeWeight: 6,
                strokeOpacity: 0.8
              },
              markerOptions: {
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#FF6B35",
                  fillOpacity: 1,
                  strokeColor: "#FFFFFF",
                  strokeWeight: 2
                }
              }
            }}
          />
        )}

        {/* Alternative routes - lighter blue color */}
        {alternativeRoutes.map((route, index) => (
          <DirectionsRenderer
            key={`alt-route-${index}`}
            directions={route}
            options={{ 
              preserveViewport: true,
              polylineOptions: {
                strokeColor: "#87CEEB", // Light blue for alternative routes
                strokeWeight: 4,
                strokeOpacity: 0.6
              },
              markerOptions: {
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 6,
                  fillColor: "#87CEEB",
                  fillOpacity: 0.8,
                  strokeColor: "#FFFFFF",
                  strokeWeight: 1
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
              setSelectedStation(stop);
              
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
          const stationsToRender = filteredStations();
          
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
                onClick={() => setSelectedStation(station)}
              />
            );
          }).filter(Boolean); // Remove null values
        })()}

        {/* Recommended charging station marker - always show even if not in filtered list */}
        {showRecommendedLocations && recommendedStation && !filteredStations().some(station => station.id === recommendedStation.id) && (
          <Marker
            key={`recommended-${recommendedStation.id}`}
            position={{ lat: recommendedStation.latitude, lng: recommendedStation.longitude }}
            title={`Recommended: ${recommendedStation.title}`}
            icon={{
              url: "https://maps.google.com/mapfiles/ms/icons/orange-dot.png",
              scaledSize: new window.google.maps.Size(48, 48),
            }}
            onClick={() => setSelectedStation(recommendedStation)}
          />
        )}

        {/* Info window for station */}
        {selectedStation && (
          <InfoWindow
            position={{
              lat: selectedStation.latitude,
              lng: selectedStation.longitude,
            }}
            onCloseClick={() => setSelectedStation(null)}
          >
            <div style={{ minWidth: 200, background: mapStyle ? "#18181b" : "#fff", color: mapStyle ? "#d1d5db" : "#111827", borderRadius: "8px", padding: "12px" }}>
              {/* Show if this is the recommended station */}
              {showRecommendedLocations && autoSelectedChargingStation && selectedStation.id === autoSelectedChargingStation.id && (
                <div style={{
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "4px",
                  padding: "6px 8px",
                  marginBottom: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#dc2626"
                }}>
                  Recommended Charging Station
                </div>
              )}
              
              <h4>{selectedStation.title}</h4>
              {selectedStation.batteryPercentAtArrival !== undefined && (
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ color: "#5f6368", fontWeight: 500 }}>
                    Battery at arrival:
                    <span
                      style={{
                        marginLeft: "4px",
                        fontWeight: 600,
                        color:
                          selectedStation.batteryPercentAtArrival >= 50
                            ? "#10b981" // green
                            : selectedStation.batteryPercentAtArrival >= 20
                            ? "#fbbf24" // yellow
                            : "#ef4444" // red
                      }}
                    >
                      {selectedStation.batteryPercentAtArrival}%
                    </span>
                  </span>
                </div>
              )}
              {selectedStation.address && <p>{selectedStation.address}</p>}
              {selectedStation.town && (
                <p>
                  {selectedStation.town}, {selectedStation.state}
                </p>
              )}
              {selectedStation.operator && (
                <p>Operator: {selectedStation.operator}</p>
              )}
              {selectedStation.statusType && (
                <p>Status: {selectedStation.statusType}</p>
              )}
              {selectedStation.numberOfPoints && (
                <p>Charging Points: {selectedStation.numberOfPoints}</p>
              )}
              
              {/* Show pricing information */}
              {selectedStation.usageCost && (
                <p style={{ 
                  color: "#2563eb", 
                  fontWeight: "600",
                  backgroundColor: "#f0f9ff",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  margin: "8px 0"
                }}>
                  💳 Price: {selectedStation.usageCost}
                </p>
              )}

              {/* Show charging details if this is the recommended station */}
              {showRecommendedLocations && autoSelectedChargingStation && selectedStation.id === autoSelectedChargingStation.id && (
                <div style={{ 
                  backgroundColor: "#f0fdf4", 
                  border: "1px solid #bbf7d0", 
                  borderRadius: "4px", 
                  padding: "8px", 
                  marginTop: "8px",
                  fontSize: "12px"
                }}>
                  {selectedStation.batteryPercentAtArrival !== undefined && (
                    <div style={{ marginBottom: "4px" }}>
                      <span style={{ color: "#5f6368", fontWeight: 500 }}>
                        Battery at arrival:
                        <span
                          style={{
                            marginLeft: "4px",
                            fontWeight: 600,
                            color:
                              selectedStation.batteryPercentAtArrival >= 50
                                ? "#10b981" // green
                                : selectedStation.batteryPercentAtArrival >= 20
                                ? "#fbbf24" // yellow
                                : "#ef4444" // red
                          }}
                        >
                          {selectedStation.batteryPercentAtArrival}%
                        </span>
                      </span>
                    </div>
                  )}
                  <div><strong>Max Power:</strong> {selectedStation.maxPowerKW}kW</div>
                  <div><strong>Est. Charging Time:</strong> {selectedStation.estimatedChargingTimeMinutes} min</div>
                  <div><strong>Distance from start:</strong> {selectedStation.distanceFromStart}km</div>
                  {selectedStation.actualDetour !== undefined && selectedStation.actualDetour > 0 && (
                    <div style={{ color: "#ea4335", fontWeight: "500" }}>
                      <strong>Detour:</strong> +{selectedStation.actualDetour}km
                      {selectedStation.routingSuccess === false && (
                        <span style={{ fontSize: "10px", color: "#9ca3af", marginLeft: "4px" }}>(est.)</span>
                      )}
                    </div>
                  )}
                  {selectedStation.actualDetour !== undefined && selectedStation.actualDetour <= 0 && (
                    <div style={{ color: "#10b981", fontWeight: "500" }}>
                      <strong>Route efficiency:</strong> {selectedStation.actualDetour === 0 ? 'No detour' : `${Math.abs(selectedStation.actualDetour)}km shorter`}
                    </div>
                  )}
                  {selectedStation.rejoinDetour && selectedStation.rejoinDetour > 0 && (
                    <div style={{ color: "#f59e0b", fontWeight: "500" }}>
                      <strong>Route rejoin detour:</strong> +{selectedStation.rejoinDetour}km
                    </div>
                  )}
                  <div><strong>Range at destination:</strong> {selectedStation.remainingRangeAtDestination}km</div>
                  {selectedStation.usageCost && (
                    <div style={{ 
                      marginTop: "4px", 
                      color: "#2563eb", 
                      fontWeight: "600"
                    }}>
                      <strong>💳 Price:</strong> {selectedStation.usageCost}
                    </div>
                  )}
                </div>
              )}



              {selectedStation.connections &&
                selectedStation.connections.length > 0 && (
                  <div style={{ background: mapStyle ? "#27272a" : "#fff", color: mapStyle ? "#d1d5db" : "#111827", borderRadius: "6px", padding: "8px", marginTop: "8px" }}>
                    <strong>Connection Types:</strong>
                    <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                      {selectedStation.connections.map(
                        (conn: any, idx: number) => (
                          <li key={idx} style={{ marginBottom: "4px" }}>
                            <strong>{conn.type}</strong>
                            {conn.powerKW && <span> - {conn.powerKW} kW</span>}
                            {conn.level && <span> ({conn.level})</span>}
                            {conn.quantity && conn.quantity > 1 && (
                              <span> (x{conn.quantity})</span>
                            )}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Route info card */}
      {((distance && duration) || (chargingStopInfo && chargingStopInfo.needsCharging)) && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            background: "#fff",
            padding: "16px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            border: "1px solid #dadce0",
            fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
            fontSize: "14px",
            minWidth: "240px",
            maxWidth: "340px",
            maxHeight: "70vh",
            overflowY: "auto",
            zIndex: 1000,
          }}
        >
          {/* Charging route information */}
          {showChargingRoute && chargingStopInfo?.routeDetails && (
            <div>
              {/* Total Trip Summary*/}
              <div style={{ marginBottom: "16px" }}>
                <div style={{
                    display: "flex", 
                    alignItems: "center", 
                    marginBottom: "4px" 
                }}>
                  <div style={{
                    width: "12px",
                    height: "12px",
                    backgroundColor: "#1a73e8",
                    borderRadius: "50%",
                    marginRight: "8px",
                  }}></div>
                  <span style={{ 
                    fontSize: "16px", 
                    fontWeight: "500", 
                    color: "#202124" 
                  }}>
                    {(() => {
                      const totalMin = Math.round(chargingStopInfo.routeDetails.totalTravelTime);
                      if (totalMin >= 60) {
                        const h = Math.floor(totalMin / 60);
                        const m = totalMin % 60;
                        return `${h}h${m > 0 ? ' ' + m + ' min' : ''}`;
                      }
                      return `${totalMin} min`;
                    })()}
                  </span>
                  <span style={{ 
                    fontSize: "14px", 
                    color: "#5f6368", 
                    marginLeft: "8px" 
                  }}>
                    ({chargingStopInfo.routeDetails.totalDistanceViaStation} km)
                  </span>
                </div>
                
                <div style={{ fontSize: "12px", color: "#5f6368", marginBottom: "2px" }}>
                  Range at start: {typeof batteryRange === 'number' ? `${batteryRange} km (` : 'N/A'}
                  {(() => {
                    const percent = batteryCapacity && batteryRange ? (batteryRange / batteryCapacity) * 100 : null;
                    if (percent === null) return 'N/A';
                    let color = '#10b981'; // green
                    if (percent < 20) color = '#ef4444'; // red
                    else if (percent < 50) color = '#fbbf24'; // orange
                    return <span style={{ color }}>{percent.toFixed(1)}%</span>;
                  })()}
                  {typeof batteryRange === 'number' ? ')' : ''}
                </div>
                <div style={{ 
                  fontSize: "13px", 
                  color: "#1976d2",
                  marginBottom: "4px"
                }}>
                  Fastest route with charging • via {autoSelectedChargingStation?.title || autoSelectedChargingStation?.name || 'charging station'}
                </div>
                
                <div style={{ 
                  fontSize: "12px", 
                  color: "#5f6368" 
                }}>
                  +{autoSelectedChargingStation?.estimatedChargingTimeMinutes} min longer than usual due to charging
                </div>
                
                {chargingStopInfo.routeDetails.actualDetour > 0 && (
                  <div style={{ 
                    fontSize: "12px", 
                    color: "#1976d2",
                    marginTop: "2px"
                  }}>
                    +{chargingStopInfo.routeDetails.actualDetour} km detour from planned route
                    {chargingStopInfo.routeDetails.routingSuccess === false && (
                      <span style={{ fontSize: "10px", color: "#9ca3af", marginLeft: "4px" }}>(estimated)</span>
                    )}
                  </div>
                )}
                {chargingStopInfo.routeDetails.actualDetour <= 0 && (
                  <div style={{ 
                    fontSize: "12px", 
                    color: "#10b981",
                    marginTop: "2px"
                  }}>
                    {chargingStopInfo.routeDetails.actualDetour === 0 ? 'No detour required' : `${Math.abs(chargingStopInfo.routeDetails.actualDetour)}km more efficient route`}
                  </div>
                )}
              </div>

              {/* Route Steps */}
              <div style={{ borderTop: "1px solid #e8eaed", paddingTop: "12px" }}>
                
                {/* Step 1: Drive to charging station */}
                <div style={{ 
                  display: "flex", 
                  marginBottom: "12px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid #f1f3f4"
                }}>
                  <div style={{ 
                    width: "24px", 
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    marginRight: "12px"
                  }}>
                    <div style={{
                      width: "8px",
                      height: "8px",
                      backgroundColor: "#1a73e8",
                      borderRadius: "50%",
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 2px #1a73e8"
                    }}></div>
                    <div style={{
                      width: "2px",
                      height: "20px",
                      backgroundColor: "#dadce0",
                      marginTop: "4px"
                    }}></div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: "14px", 
                      color: "#202124", 
                      fontWeight: "400",
                      marginBottom: "2px"
                    }}>
                      Drive to charging station
                    </div>
                    <div style={{ 
                      fontSize: "12px", 
                      color: "#5f6368" 
                    }}>
                      {(() => {
                        const min = chargingStopInfo.routeDetails.timeToStation;
                        if (min >= 60) {
                          const h = Math.floor(min / 60);
                          const m = min % 60;
                          return `${h}h${m > 0 ? ' ' + m + ' min' : ''}`;
                        }
                        return `${min} min`;
                      })()} • {(chargingStopInfo.routeDetails.originalDistance || distance).toString().endsWith('km') ? (chargingStopInfo.routeDetails.originalDistance || distance) : `${chargingStopInfo.routeDetails.originalDistance || distance} km`}
                    </div>
                    {chargingStopInfo.routeDetails.actualDetour > 0 && (
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#1976d2",
                        marginTop: "2px"
                      }}>
                        +{chargingStopInfo.routeDetails.actualDetour} km detour from planned route
                        {chargingStopInfo.routeDetails.routingSuccess === false && (
                          <span style={{ fontSize: "10px", color: "#9ca3af", marginLeft: "4px" }}>(est.)</span>
                        )}
                      </div>
                    )}
                    {chargingStopInfo.routeDetails.actualDetour <= 0 && (
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#10b981",
                        marginTop: "2px"
                      }}>
                        {chargingStopInfo.routeDetails.actualDetour === 0 ? 'No detour' : `${Math.abs(chargingStopInfo.routeDetails.actualDetour)}km shorter`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: Charge */}
                <div style={{ 
                  display: "flex", 
                  marginBottom: "12px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid #f1f3f4"
                }}>
                  <div style={{ 
                    width: "24px", 
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    marginRight: "12px"
                  }}>
                    <div style={{
                      width: "8px",
                      height: "8px",
                      backgroundColor: "#fbbc04",
                      borderRadius: "50%",
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 2px #fbbc04"
                    }}></div>
                    <div style={{
                      width: "2px",
                      height: "20px",
                      backgroundColor: "#dadce0",
                      marginTop: "4px"
                    }}></div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: "14px", 
                      color: "#202124", 
                      fontWeight: "400",
                      marginBottom: "2px"
                    }}>
                      Charge at {autoSelectedChargingStation?.title}
                    </div>
                    <div style={{ 
                      fontSize: "12px", 
                      color: "#5f6368" 
                    }}>
                      Battery at arrival: {
                        typeof autoSelectedChargingStation?.distanceFromStart === 'number' && batteryCapacity
                          ? <>
                              {autoSelectedChargingStation.distanceFromStart} km (
                              {(() => {
                                const percent = ((autoSelectedChargingStation.distanceFromStart / batteryCapacity) * 100);
                                const percentStr = percent.toFixed(1);
                                let color = '#10b981'; // green
                                if (percent < 20) color = '#ef4444'; // red
                                else if (percent < 50) color = '#fbbf24'; // orange
                                return <span style={{ color }}>{percentStr}%</span>;
                              })()}
                              )
                            </>
                          : 'N/A'
                      }
                    </div>
                    <div style={{ 
                      fontSize: "12px", 
                      color: "#5f6368" 
                    }}>
                      {(() => {
                        const min = chargingStopInfo.routeDetails.chargingTime;
                        if (min >= 60) {
                          const h = Math.floor(min / 60);
                          const m = min % 60;
                          return `${h}h${m > 0 ? ' ' + m + ' min' : ''}`;
                        }
                        return `${min} min`;
                      })()} • {autoSelectedChargingStation?.maxPowerKW}kW
                      {autoSelectedChargingStation?.usageCost && (
                        <span> • {autoSelectedChargingStation.usageCost}</span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#1976d2", marginTop: "4px" }}>
                      <span style={{ color: '#5f6368' }}>
                        Estimated charging time to 80%: <strong>{autoSelectedChargingStation?.estimatedChargingTimeMinutes} min</strong>
                      </span>
                    </div>
                    {/* Charging station details moved here */}
                    <div 
                      style={{ 
                        marginTop: "12px", 
                        padding: "8px", 
                        backgroundColor: "#f8f9fa", 
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: "pointer",
                        border: "1px solid #dadce0",
                        transition: "all 0.2s ease"
                      }}
                      onClick={() => handleRecommendedStationClick(autoSelectedChargingStation)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#e8f0fe";
                        e.currentTarget.style.borderColor = "#1a73e8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#f8f9fa";
                        e.currentTarget.style.borderColor = "#dadce0";
                      }}
                      title="Click to zoom to charging station"
                    >
                      <div style={{ fontWeight: "500", color: "#202124", fontSize: "13px" }}>
                        {autoSelectedChargingStation.title}
                      </div>
                      <div style={{ color: "#5f6368", marginTop: "2px" }}>
                        {autoSelectedChargingStation.numberOfPoints} charging points • {autoSelectedChargingStation.operator || '(Unknown Operator)'}
                      </div>
                      <div style={{ 
                        color: "#1a73e8", 
                        fontSize: "11px", 
                        marginTop: "4px",
                        fontWeight: "500"
                      }}>
                        Tap for details
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3: Drive to destination */}
                <div style={{ 
                  display: "flex", 
                  marginBottom: "8px"
                }}>
                  <div style={{ 
                    width: "24px", 
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    marginRight: "12px"
                  }}>
                    <div style={{
                      width: "8px",
                      height: "8px",
                      backgroundColor: "#34a853",
                      borderRadius: "50%",
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 2px #34a853"
                    }}></div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: "14px", 
                      color: "#202124", 
                      fontWeight: "400",
                      marginBottom: "2px"
                    }}>
                      Drive to destination
                    </div>
                    <div style={{ 
                      fontSize: "12px", 
                      color: "#5f6368",
                      marginBottom: "4px"
                    }}>
                      {(() => {
                        const min = chargingStopInfo.routeDetails.timeFromStation;
                        if (min >= 60) {
                          const h = Math.floor(min / 60);
                          const m = min % 60;
                          return `${h}h${m > 0 ? ' ' + m + ' min' : ''}`;
                        }
                        return `${min} min`;
                      })()} • {(chargingStopInfo.routeDetails.distanceToEnd.toString().endsWith('km') ? chargingStopInfo.routeDetails.distanceToEnd : `${chargingStopInfo.routeDetails.distanceToEnd} km`)}
                    </div>
                    <div style={{ 
                      fontSize: "12px", 
                      color: "#5f6368"
                    }}>
                      Range at arrival: {chargingStopInfo.routeDetails.remainingRangeAtDestination} km (
                        {(() => {
                          const percent = batteryCapacity && chargingStopInfo.routeDetails.remainingRangeAtDestination
                            ? (chargingStopInfo.routeDetails.remainingRangeAtDestination / batteryCapacity) * 100
                            : null;
                          if (percent === null) return 'N/A';
                          let color = '#10b981'; // green
                          if (percent < 20) color = '#ef4444'; // red
                          else if (percent < 50) color = '#fbbf24'; // orange
                          return <span style={{ color }}>{percent.toFixed(1)}%</span>;
                        })()}
                      )
                    </div>
                  </div>
                </div>

                {/* Clickable station card */}
              </div>
            </div>
          )}

          {/* Regular route information or no charging needed summary */}
          {!showChargingRoute && chargingStopInfo && chargingStopInfo.needsCharging === false && (
            <div style={{ marginBottom: "8px" }}>
              {(() => {
                // Use backend values when available, otherwise calculate locally
                const totalDistance = Number(chargingStopInfo.totalDistance);
                const batteryRangeStart = Number(batteryRange);
                
                // Prefer backend-calculated values for accuracy
                const rangeAtArrival = chargingStopInfo.rangeAtArrival !== undefined 
                  ? Number(chargingStopInfo.rangeAtArrival)
                  : batteryRangeStart - totalDistance;
                  
                const percentAtArrival = chargingStopInfo.percentAtArrival !== undefined
                  ? Number(chargingStopInfo.percentAtArrival)
                  : batteryRangeStart > 0 ? (rangeAtArrival / batteryRangeStart) * 100 : 0;
                
                const estimatedTime = Number(chargingStopInfo.estimatedTime);
                const valid = [estimatedTime, rangeAtArrival, percentAtArrival, totalDistance].every(v => typeof v === 'number' && !isNaN(v));
                if (valid) {
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 500, color: "#202124" }}>
                          Fastest route
                        </span>
                        <span style={{ fontSize: "14px", color: "#5f6368", marginLeft: "8px" }}>
                          ({totalDistance} km)
                        </span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#1976d2", marginBottom: "4px" }}>
                        Estimated time: {estimatedTime} min
                      </div>
                      <div style={{ fontSize: "12px", color: "#5f6368" }}>
                        Range at arrival: {rangeAtArrival.toFixed(1)} km ({percentAtArrival.toFixed(1)}%)
                      </div>
                    </>
                  );
                }
                return <div style={{ color: '#ef4444' }}>Route summary unavailable</div>;
              })()}
            </div>
          )}
          {/* Fallback: show fastest route if no chargingStopInfo */}
          {!showChargingRoute && (!chargingStopInfo || chargingStopInfo.needsCharging === undefined) && distance && duration && (
            <>
              <div style={{ marginBottom: "8px" }}>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  marginBottom: "4px" 
                }}>
                  <div style={{
                    width: "12px",
                    height: "12px",
                    backgroundColor: "#1a73e8",
                    borderRadius: "50%",
                    marginRight: "8px",
                  }}></div>
                  <span style={{ 
                    fontSize: "16px", 
                    fontWeight: "500", 
                    color: "#202124" 
                  }}>
                    {duration}
                  </span>
                  <span style={{ 
                    fontSize: "14px", 
                    color: "#5f6368", 
                    marginLeft: "8px" 
                  }}>
                    ({distance})
                  </span>
                </div>
                <div style={{ 
                  fontSize: "13px", 
                  color: "#1a73e8" 
                }}>
                  Fastest route
                </div>
              </div>
            </>
          )}

          {/* Loading indicator */}
          {loadingChargingStop && (
            <div style={{
              marginTop: "12px",
              padding: "8px 12px",
              backgroundColor: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}>
              <div style={{
                width: "16px",
                height: "16px",
                marginRight: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <div style={{
                  width: "12px",
                  height: "12px",
                  border: "2px solid #d1d5db",
                  borderTop: "2px solid #4285f4",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite"
                }}></div>
              </div>
              <span style={{ color: "#4285f4", fontSize: "12px", fontWeight: "500" }}>
                Finding optimal charging station...
              </span>
            </div>
          )}
        </div>
      )}

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