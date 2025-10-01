import {
  DirectionsRenderer,
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import React, { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onLocationChange: (loc: { lat: number; lng: number }) => void;
  start: string; // can be coordinates or address
  end: string;
  batteryRange: number;
  batteryCapacity: number;
};

const chargingIcon = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";

// Helper to estimate charging time (in minutes)
function estimateChargingTime(
  currentBattery: number,
  station: any,
  batteryCapacity: number,
  extraRangeNeeded: number
) {
  const chargingSpeed = Math.max(
    ...station.connections.map((c: any) => c.powerKW || 0)
  );
  if (!chargingSpeed) return null;
  // Only charge up to the max capacity
  const energyNeeded = Math.min(extraRangeNeeded, batteryCapacity - currentBattery); // km
  return Math.ceil((energyNeeded / chargingSpeed) * 60); // minutes
}

export default function MapWeb({ onLocationChange, start, end, batteryRange, batteryCapacity }: Props) {
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);
  const [selectedChargingStation, setSelectedChargingStation] = useState<any | null>(null); // Manually selected for routing
  const [stableBestStation, setStableBestStation] = useState<any | null>(null); // Stable auto-selected station
  const [alternativeStations, setAlternativeStations] = useState<any[]>([]); // Alternative charging stations
  const [showAlternatives, setShowAlternatives] = useState<boolean>(false); // Show alternative stations
  const [showChargingPanels, setShowChargingPanels] = useState<boolean>(false); // Stable UI state
  const [cachedRouteKey, setCachedRouteKey] = useState<string>(""); // Cache key for route
  const [routeStationsFetched, setRouteStationsFetched] = useState<boolean>(false); // Track if stations fetched for current route
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
    libraries: ['places', 'geometry'], // Add geometry library for distance calculations
  });

  // Helper function to calculate distance from a point to the route path
  const getDistanceToRoute = useCallback((
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
  }, []);

  // Filter stations based on route proximity (only when route exists)
  function filteredStations() {
    if (!directionsResponse || !start || !end) {
      // No route planned - show all stations
      return stations;
    }
    
    // Route exists - show stations within 2km of route
    const MAX_DISTANCE_METERS = 2000; // 2km
    return stations.filter(station => {
      const distance = getDistanceToRoute(station.latitude, station.longitude, directionsResponse!);
      return distance <= MAX_DISTANCE_METERS;
    });
  }

  // Function to fetch stations based on map bounds
  const fetchStationsInBounds = useCallback(async (mapInstance: google.maps.Map) => {
    const bounds = mapInstance.getBounds();
    if (!bounds) return;

    let ne = bounds.getNorthEast();
    let sw = bounds.getSouthWest();

    // If a route is planned, expand bounds to cover the entire route
    if (directionsResponse && directionsResponse.routes[0]) {
      const routeBounds = directionsResponse.routes[0].bounds;
      if (routeBounds) {
        // Expand current bounds to include the entire route
        const routeNe = routeBounds.getNorthEast();
        const routeSw = routeBounds.getSouthWest();
        
        ne = new google.maps.LatLng(
          Math.max(ne.lat(), routeNe.lat()),
          Math.max(ne.lng(), routeNe.lng())
        );
        sw = new google.maps.LatLng(
          Math.min(sw.lat(), routeSw.lat()),
          Math.min(sw.lng(), routeSw.lng())
        );
      }
    }

    const params = new URLSearchParams({
      north: ne.lat().toString(),
      south: sw.lat().toString(),
      east: ne.lng().toString(),
      west: sw.lng().toString(),
      maxResults: '500' // Increased to get more stations along route
    });

    try {
      const response = await fetch(`http://localhost:3001/api/charging-stations?${params}`);
      
      // Check if the request was successful
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const newStations = await response.json();
      
      // Clear any previous backend error
      setBackendError(false);
      
      // Smart merge: keep existing stations that are still visible, add new ones
      setStations(prevStations => {
        // Create a map of new stations by ID for quick lookup
        const newStationsMap = new Map(newStations.map((station: any) => [station.id, station]));
        
        // Keep existing stations that are still in the new data
        const keptStations = prevStations.filter(station => newStationsMap.has(station.id));
        
        // Add new stations that weren't in the previous data
        const keptStationIds = new Set(keptStations.map(station => station.id));
        const addedStations = newStations.filter((station: any) => !keptStationIds.has(station.id));
        
        // Also remove stations that are now outside the visible bounds
        const currentBounds = bounds;
        const visibleStations = keptStations.filter(station => {
          const stationLat = station.latitude;
          const stationLng = station.longitude;
          return stationLat >= sw.lat() && stationLat <= ne.lat() && 
                 stationLng >= sw.lng() && stationLng <= ne.lng();
        });
        
        return [...visibleStations, ...addedStations];
      });
    } catch (error) {
      console.error("Error fetching stations:", error);
      
      // Check if it's a network error (backend not running)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setBackendError(true);
      } else if (error instanceof Error && error.message.includes('HTTP error')) {
        setBackendError(true);
      }
    } finally {
      setLoadingStations(false);
    }
  }, [directionsResponse]); // Add directionsResponse to dependency array

  // Debounced bounds change handler - only fetch when no route is set
  const debouncedFetchStations = useRef<number | null>(null);
  const onBoundsChanged = useCallback(() => {
    // Don't fetch new stations if we have a route and already fetched stations for it
    if (directionsResponse && routeStationsFetched) {
      return;
    }
    
    if (map) {
      // Clear previous timeout
      if (debouncedFetchStations.current) {
        clearTimeout(debouncedFetchStations.current);
      }
      
      // Set new timeout
      debouncedFetchStations.current = setTimeout(() => {
        fetchStationsInBounds(map);
      }, 500) as unknown as number; // Wait 500ms after user stops zooming/panning
    }
  }, [map, fetchStationsInBounds, directionsResponse, routeStationsFetched]);

  // Handle map load
  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    // Initial fetch when map loads
    fetchStationsInBounds(mapInstance);
  }, [fetchStationsInBounds]);

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
          const fallback = { lat: 57.7089, lng: 11.9746 };
          setCurrentLocation(fallback);
          onLocationChange(fallback);

          if (!initialCenter.current) {
            initialCenter.current = fallback; // fallback center
          }
        }
      );
    } else {
      console.error("Geolocation not supported");
      const fallback = { lat: 57.7089, lng: 11.9746 };
      setCurrentLocation(fallback);
      onLocationChange(fallback);

      if (!initialCenter.current) {
        initialCenter.current = fallback;
      }
    }
  }, [onLocationChange]);

  // Refetch stations when route changes to include stations along the entire route
  useEffect(() => {
    if (map && directionsResponse) {
      fetchStationsInBounds(map);
      setRouteStationsFetched(true); // Mark that we've fetched stations for this route
    } else if (!directionsResponse) {
      setRouteStationsFetched(false); // Reset when no route
    }
  }, [directionsResponse, map, fetchStationsInBounds]);

  // Battery range check
  const exceedsRange = React.useMemo(() => {
    if (!batteryRange) return false;
    
    // Check from distance state first
    if (distance) {
      return parseFloat(distance.replace(/[^\d.]/g, "")) > batteryRange;
    }
    
    // Fallback to checking directionsResponse
    if (directionsResponse && directionsResponse.routes[0]?.legs[0]?.distance?.value) {
      const routeDistanceKm = directionsResponse.routes[0].legs[0].distance.value / 1000;
      return routeDistanceKm > batteryRange;
    }
    
    return false;
  }, [distance, batteryRange, directionsResponse]);

  // Create a stable route key to detect actual route changes (without circular dependencies)
  const currentRouteKey = React.useMemo(() => {
    if (!directionsResponse || !start || !end) return "";
    // Only include basic route parameters, not derived states that could cause circular updates
    return `${start}-${end}-${batteryRange}`;
  }, [directionsResponse, start, end, batteryRange]);

  // Find best charging station only when route actually changes
  useEffect(() => {
    // Only recalculate if route has actually changed or if we don't have a cached route yet
    if (!directionsResponse || currentRouteKey === cachedRouteKey) {
      return;
    }

    // Only find charging stations if route exceeds range
    if (!exceedsRange) {
      setStableBestStation(null);
      setAlternativeStations([]);
      setNeedsChargingStations(false);
      setCachedRouteKey(currentRouteKey);
      return;
    }

    // Mark that we need charging stations
    setNeedsChargingStations(true);

    // Need to have stations loaded to find charging stations
    if (!stations.length) {
      // Don't update cache key yet, wait for stations to load
      return;
    }

    // Reset station fetched flag when route changes
    setRouteStationsFetched(false);

    // This function runs only when route changes, not when stations change
    const findBestStations = () => {
      if (!directionsResponse.routes[0].bounds) return { best: null, alternatives: [] };
      
      const routeBounds = directionsResponse.routes[0].bounds;
      const currentStations = stations.filter(station => {
        const stationPos = new google.maps.LatLng(station.latitude, station.longitude);
        return routeBounds.contains(stationPos);
      });
      
      if (!currentStations.length) return { best: null, alternatives: [] };
      
      // Target: Find station as close as possible to max range - 10km safety buffer
      const safetyBuffer = 10; // km
      const targetDistance = batteryRange - safetyBuffer;
      
      const routePoints = directionsResponse.routes[0].overview_path;
      let traveled = 0;
      let lastPoint = routePoints[0];
      const candidateStations: any[] = [];
      
      for (let i = 1; i < routePoints.length; i++) {
        const segment = google.maps.geometry.spherical.computeDistanceBetween(
          lastPoint,
          routePoints[i]
        ) / 1000;
        traveled += segment;
        lastPoint = routePoints[i];
        
        // Look for stations near this point on the route
        for (const station of currentStations) {
          const dist = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(station.latitude, station.longitude),
            routePoints[i]
          ) / 1000;
          
          // Station must be within 2km of route and we must be close to target distance
          if (dist < 2 && traveled <= batteryRange) {
            const distanceFromTarget = Math.abs(traveled - targetDistance);
            const stationWithData = {
              ...station,
              distanceFromStart: traveled,
              routeDistance: dist,
              distanceFromTarget: distanceFromTarget
            };
            
            // Avoid duplicates
            if (!candidateStations.find(s => s.id === station.id)) {
              candidateStations.push(stationWithData);
            }
          }
        }
        
        // Stop if we've gone past the battery range
        if (traveled > batteryRange) break;
      }
      
      // Sort by distance from target (best stations first)
      candidateStations.sort((a, b) => a.distanceFromTarget - b.distanceFromTarget);
      
      const best = candidateStations[0] || null;
      const alternatives = candidateStations.slice(1, 4); // Get up to 3 alternatives
      
      return { best, alternatives };
    };

    const { best: newBestStation, alternatives: newAlternatives } = findBestStations();
    setStableBestStation(newBestStation);
    setAlternativeStations(newAlternatives);
    setNeedsChargingStations(false); // Clear the flag
    setCachedRouteKey(currentRouteKey);
  }, [currentRouteKey, cachedRouteKey, directionsResponse, exceedsRange, batteryRange, selectedChargingStation]);

  // Effect to find charging stations when stations are loaded and we need them
  useEffect(() => {
    // If we need charging stations and now have stations loaded, trigger the main effect
    if (needsChargingStations && stations.length > 0 && directionsResponse && exceedsRange) {
      // Force re-run of the main charging station finding effect by clearing the cache
      setCachedRouteKey("");
    }
  }, [needsChargingStations, stations.length, directionsResponse, exceedsRange]);

  // Simplified bestChargingStation that just returns the cached stable station
  const bestChargingStation = stableBestStation;

  // Stable UI state management - determine if charging panels should be shown
  const shouldShowChargingPanels = React.useMemo(() => {
    return Boolean(selectedChargingStation || (exceedsRange && stableBestStation));
  }, [selectedChargingStation, exceedsRange, stableBestStation]);

  // Update showChargingPanels state only when shouldShow changes
  useEffect(() => {
    setShowChargingPanels(shouldShowChargingPanels);
  }, [shouldShowChargingPanels]);

  // Calculate route whenever start/end/charging station changes - stable calculation
  const routeCalculationKey = React.useMemo(() => {
    const chargingStationId = selectedChargingStation?.id || stableBestStation?.id || "none";
    return `${start}-${end}-${chargingStationId}-${exceedsRange}`;
  }, [start, end, selectedChargingStation?.id, stableBestStation?.id, exceedsRange]);

  useEffect(() => {
    if (!isLoaded || !start || !end) return;

    const directionsService = new google.maps.DirectionsService();
    
    // Use manually selected station if available, otherwise use stable auto-selected one
    const chargingStation = selectedChargingStation || stableBestStation;
    
    // If charging is needed and a station is selected, create two separate routes
    if ((exceedsRange || selectedChargingStation) && chargingStation) {
      // Route 1: Start to charging station
      directionsService.route(
        {
          origin: start,
          destination: { lat: chargingStation.latitude, lng: chargingStation.longitude },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) {
            setDirectionsResponse(result);
            const leg = result.routes[0].legs[0];
            setDistance(leg.distance?.text || null);
            setDuration(leg.duration?.text || null);
          } else {
            console.error("Directions request to charging station failed:", status);
          }
        }
      );

      // Route 2: Charging station to destination
      directionsService.route(
        {
          origin: { lat: chargingStation.latitude, lng: chargingStation.longitude },
          destination: end,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) {
            setChargingRouteResponse(result);
            
            // Calculate total distance and duration by combining both routes
            const secondLeg = result.routes[0].legs[0];
            
            // Get first leg from current directionsResponse
            const firstLegDistance = parseFloat(distance?.replace(/[^\d.]/g, "") || "0");
            const firstLegDuration = duration ? 
              parseInt(duration.replace(/[^\d]/g, "")) || 0 : 0;
            
            const totalDistanceValue = (
              firstLegDistance +
              parseFloat(secondLeg.distance?.text?.replace(/[^\d.]/g, "") || "0")
            ).toFixed(1);
            
            const totalDurationValue = (
              firstLegDuration + parseInt(secondLeg.duration?.text?.replace(/[^\d]/g, "") || "0")
            );
            
            setTotalDistance(`${totalDistanceValue} km`);
            setTotalDuration(`${totalDurationValue} min`);
          } else {
            console.error("Directions request from charging station failed:", status);
          }
        }
      );

      // Calculate alternative routes for alternative charging stations
      if (alternativeStations.length > 0 && showAlternatives) {
        const altRoutes: google.maps.DirectionsResult[] = [];
        let completedRequests = 0;
        
        alternativeStations.forEach((altStation, index) => {
          directionsService.route(
            {
              origin: start,
              destination: { lat: altStation.latitude, lng: altStation.longitude },
              travelMode: google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
              completedRequests++;
              if (status === "OK" && result) {
                altRoutes[index] = result;
              }
              
              if (completedRequests === alternativeStations.length) {
                setAlternativeRoutes(altRoutes.filter(route => route !== undefined));
              }
            }
          );
        });
      } else {
        setAlternativeRoutes([]);
      }
    } else {
      // Single route when no charging needed
      directionsService.route(
        {
          origin: start,
          destination: end,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) {
            setDirectionsResponse(result);
            setChargingRouteResponse(null);
            const leg = result.routes[0].legs[0];
            setDistance(leg.distance?.text || null);
            setDuration(leg.duration?.text || null);
            setTotalDistance(leg.distance?.text || null);
            setTotalDuration(leg.duration?.text || null);
          } else {
            console.error("Directions request failed:", status);
          }
        }
      );
    }
  }, [isLoaded, routeCalculationKey]);

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

  // Calculate how much extra range is needed
  const extraRangeNeeded = exceedsRange && distance
    ? Math.max(0, parseFloat(distance.replace(/[^\d.]/g, "")) - batteryRange)
    : 0;

  if (loadError) return <div>Failed to load Google Maps: {String(loadError)}</div>;
  if (!isLoaded || !initialCenter.current) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Loading map...</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <GoogleMap
        center={initialCenter.current} //  only set once
        zoom={12}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        options={{ streetViewControl: false, mapTypeControl: false }}
        onLoad={onLoad}
        onBoundsChanged={onBoundsChanged}
      >
        {/* User marker */}
        {currentLocation && <Marker position={currentLocation} title="You are here" />}

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

        {/* Charging station markers - filtered by route proximity */}
        {!loadingStations &&
          Array.isArray(filteredStations()) &&
          filteredStations().map((station: any) => {
            const isSelected = selectedChargingStation?.id === station.id;
            const isAutoSelected = stableBestStation?.id === station.id && !selectedChargingStation;
            
            return (
              <Marker
                key={station.id}
                position={{ lat: station.latitude, lng: station.longitude }}
                title={station.title}
                icon={{
                  url: isSelected 
                    ? "https://maps.google.com/mapfiles/ms/icons/blue-dot.png" // Blue for manually selected
                    : isAutoSelected 
                    ? "https://maps.google.com/mapfiles/ms/icons/orange-dot.png" // Orange for auto-selected
                    : chargingIcon, // Green for regular stations
                  scaledSize: new window.google.maps.Size(32, 32),
                }}
                onClick={() => setSelectedStation(station)}
              />
            );
          })}

        {/* Info window for station */}
        {selectedStation && (
          <InfoWindow
            position={{
              lat: selectedStation.latitude,
              lng: selectedStation.longitude,
            }}
            onCloseClick={() => setSelectedStation(null)}
          >
            <div style={{ minWidth: 200 }}>
              <h4>{selectedStation.title}</h4>
              {selectedStation.address && <p>{selectedStation.address}</p>}
              {selectedStation.town && (
                <p>
                  {selectedStation.town}, {selectedStation.state}
                </p>
              )}
              {selectedStation.operator && <p>Operator: {selectedStation.operator}</p>}
              {selectedStation.statusType && <p>Status: {selectedStation.statusType}</p>}
              {selectedStation.numberOfPoints && <p>Points: {selectedStation.numberOfPoints}</p>}
              
              {selectedStation.connections && selectedStation.connections.length > 0 && (
                <div>
                  <strong>Connection Types:</strong>
                  <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                    {selectedStation.connections.map((conn: any, idx: number) => (
                      <li key={idx} style={{ marginBottom: "4px" }}>
                        <strong>{conn.type}</strong>
                        {conn.powerKW && <span> - {conn.powerKW} kW</span>}
                        {conn.level && <span> ({conn.level})</span>}
                        {conn.quantity && conn.quantity > 1 && <span> (x{conn.quantity})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Route to station buttons */}
              <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    setSelectedChargingStation(selectedStation);
                    setSelectedStation(null); // Close info window
                  }}
                  style={{
                    backgroundColor: "#1976d2",
                    color: "white",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Route to this station
                </button>
                
                {selectedChargingStation?.id === selectedStation.id && (
                  <button
                    onClick={() => {
                      setSelectedChargingStation(null);
                      setSelectedStation(null);
                      if (!stableBestStation) {
                        setShowChargingPanels(false);
                      }
                    }}
                    style={{
                      backgroundColor: "#d32f2f",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Clear route
                  </button>
                )}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Route info + battery warning */}
      {distance && duration && (
        <div
          style={{
            position: "absolute",
            bottom: showChargingPanels ? 200 : 20, // Move up if charging suggestion is shown
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            padding: "12px 18px",
            borderRadius: "12px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            maxWidth: "90%",
            textAlign: "center",
          }}
        >
          {showChargingPanels ? (
            // Two-part journey display
            <div>
              <h4 style={{ margin: "0 0 12px 0", color: "#1976d2" }}>
                {selectedChargingStation ? "Custom Route Plan" : "Journey Plan"}
              </h4>
              <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "12px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#FF6B35", fontWeight: "bold", fontSize: "12px" }}>TO CHARGING</div>
                  <div><strong>{distance}</strong></div>
                  <div style={{ fontSize: "14px", color: "#666" }}>{duration}</div>
                </div>
                <div style={{ color: "#666", alignSelf: "center" }}>⚡</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#34A853", fontWeight: "bold", fontSize: "12px" }}>TO DESTINATION</div>
                  <div><strong>{chargingRouteResponse ? chargingRouteResponse.routes[0].legs[0].distance?.text : "..."}</strong></div>
                  <div style={{ fontSize: "14px", color: "#666" }}>{chargingRouteResponse ? chargingRouteResponse.routes[0].legs[0].duration?.text : "..."}</div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #eee", paddingTop: "8px" }}>
                <strong>Total: {totalDistance || "Calculating..."} – {totalDuration || "Calculating..."}</strong>
              </div>
              {selectedChargingStation ? (
                <p style={{ color: "#1976d2", fontWeight: "bold", margin: "8px 0 0 0", fontSize: "14px" }}>
                  Routing to: {selectedChargingStation.title}
                </p>
              ) : (
                <p style={{ color: "red", fontWeight: "bold", margin: "8px 0 0 0", fontSize: "14px" }}>
                  Charging required (Battery range: {batteryRange} km)
                </p>
              )}
            </div>
          ) : (
            // Single route display
            <div>
              <p style={{ margin: "0" }}>
                Distance: <strong>{distance}</strong> – Duration: <strong>{duration}</strong>
              </p>
              {exceedsRange && (
                <p style={{ color: "red", fontWeight: "bold", margin: "8px 0 0 0" }}>
                  Route exceeds your battery range ({batteryRange} km)!
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Charging station suggestion */}
      {showChargingPanels && (stableBestStation || selectedChargingStation) && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: selectedChargingStation ? "#e3f2fd" : "#e6f4fe",
            padding: "14px 18px",
            borderRadius: "12px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            maxWidth: "90%",
            minWidth: 320,
          }}
        >
          <h4 
            style={{ 
              margin: "0 0 12px 0", 
              color: "#1976d2", 
              cursor: "pointer",
              textDecoration: "underline"
            }}
            onClick={() => handleRecommendedStationClick(selectedChargingStation || stableBestStation)}
          >
            {selectedChargingStation ? "Selected Charging Stop" : "Recommended Charging Stop"} 📍
          </h4>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>{(selectedChargingStation || stableBestStation).title}</strong>
            <br />
            {(selectedChargingStation || stableBestStation).address}
          </p>
          
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <small style={{ color: "#666" }}>Charging Speed</small>
              <p style={{ margin: "2px 0", fontWeight: "bold" }}>
                {Math.max(...(selectedChargingStation || stableBestStation).connections.map((c: any) => c.powerKW || 0))} kW
              </p>
            </div>
            
            <div>
              <small style={{ color: "#666" }}>Distance from Start</small>
              <p style={{ margin: "2px 0", fontWeight: "bold" }}>
                {distance ? parseFloat(distance.replace(/[^\d.]/g, "")).toFixed(0) : "~"} km
              </p>
            </div>
            
            <div>
              <small style={{ color: "#666" }}>Charging Time</small>
              <p style={{ margin: "2px 0", fontWeight: "bold" }}>
                {estimateChargingTime(
                  batteryRange - (distance ? parseFloat(distance.replace(/[^\d.]/g, "")) : batteryRange * 0.8), // remaining battery
                  (selectedChargingStation || stableBestStation),
                  batteryCapacity,
                  extraRangeNeeded + 20 // charge a bit extra for comfort
                ) || "N/A"} min
              </p>
            </div>
          </div>
          
          {/* Alternative stations section */}
          {!selectedChargingStation && alternativeStations.length > 0 && (
            <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
              <button
                onClick={() => setShowAlternatives(!showAlternatives)}
                style={{
                  backgroundColor: showAlternatives ? "#f44336" : "#2196f3",
                  color: "white",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  marginBottom: showAlternatives ? "12px" : "0",
                }}
              >
                {showAlternatives ? "Hide alternatives" : `Show ${alternativeStations.length} alternatives`}
              </button>
              
              {showAlternatives && (
                <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {alternativeStations.map((altStation, index) => (
                    <div 
                      key={altStation.id}
                      style={{
                        padding: "8px",
                        marginBottom: "8px",
                        backgroundColor: "#f5f5f5",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        cursor: "pointer"
                      }}
                      onClick={() => {
                        setSelectedChargingStation(altStation);
                        setShowAlternatives(false);
                      }}
                    >
                      <div style={{ fontWeight: "bold", fontSize: "12px", color: "#1976d2" }}>
                        Alternative {index + 1}
                      </div>
                      <div style={{ fontSize: "11px", marginBottom: "4px" }}>
                        {altStation.title}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#666" }}>
                        <span>{Math.round(altStation.distanceFromStart || 0)} km from start</span>
                        <span>{Math.max(...altStation.connections.map((c: any) => c.powerKW || 0))} kW</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {selectedChargingStation && (
            <button
              onClick={() => {
                setSelectedChargingStation(null);
                if (!stableBestStation) {
                  setShowChargingPanels(false);
                }
              }}
              style={{
                marginTop: "12px",
                backgroundColor: "#d32f2f",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                width: "100%",
              }}
            >
              Clear selected charging station
            </button>
          )}
        </div>
      )}

      {/* Backend Error Popup */}
      {backendError && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              padding: "24px",
              borderRadius: "12px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              maxWidth: "400px",
              margin: "20px",
              textAlign: "center",
            }}
          >
            <h3 style={{ color: "#d32f2f", marginBottom: "16px", fontWeight: "bold" }}>
              Backend Not Running
            </h3>
            <p style={{ marginBottom: "20px", color: "#666" }}>
              Backend is not running, no charging locations will be fetched.
            </p>
            <button
              onClick={() => setBackendError(false)}
              style={{
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}