import {
  DirectionsRenderer,
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onLocationChange: (loc: { lat: number; lng: number }) => void;
  start: string; // can be coordinates or address
  end: string;
  // Optional: if caller has selected exact Google place predictions
  originPlaceId?: string;
  destinationPlaceId?: string;
  batteryRange: number;
  onMapsReady?: () => void; // notify parent when Maps JS is ready (web)
};

const chargingIcon = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";

export default function MapWeb({
  onLocationChange,
  start,
  end,
  originPlaceId,
  destinationPlaceId,
  batteryRange,
  onMapsReady,
}: Props) {
  const [currentLocation, setCurrentLocation] =
    useState<google.maps.LatLngLiteral | null>(null);
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
    libraries: ["places", "geometry"], // Add geometry library for distance calculations
  });

  // Reuse a single DirectionsService instance
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(
    null
  );

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
    if (!directionsResponse || !start || !end) {
      // No route planned - show all stations
      return stations;
    }
    
    // Route exists - show stations within 2km of route
    const MAX_DISTANCE_METERS = 2000; // 2km
    return stations.filter((station) => {
      const distance = getDistanceToRoute(
        station.latitude,
        station.longitude,
        directionsResponse
      );
      return distance <= MAX_DISTANCE_METERS;
    });
  }

  // Function to fetch stations based on map bounds
  const fetchStationsInBounds = useCallback(
    async (mapInstance: google.maps.Map) => {
      const bounds = mapInstance.getBounds();
      if (!bounds) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const params = new URLSearchParams({
        north: ne.lat().toString(),
        south: sw.lat().toString(),
        east: ne.lng().toString(),
        west: sw.lng().toString(),
        maxResults: "200",
      });

      try {
        const response = await fetch(
          `http://localhost:3001/api/charging-stations?${params}`
        );

        // Check if the request was successful
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const newStations = await response.json();

        // Clear any previous backend error
        setBackendError(false);

        // Smart merge: keep existing stations that are still visible, add new ones
        setStations((prevStations) => {
          // Create a map of new stations by ID for quick lookup
          const newStationsMap = new Map(
            newStations.map((station: any) => [station.id, station])
          );

          // Keep existing stations that are still in the new data
          const keptStations = prevStations.filter((station) =>
            newStationsMap.has(station.id)
          );

          // Add new stations that weren't in the previous data
          const keptStationIds = new Set(
            keptStations.map((station) => station.id)
          );
          const addedStations = newStations.filter(
            (station: any) => !keptStationIds.has(station.id)
          );

          // Also remove stations that are now outside the visible bounds
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

        // Check if it's a network error (backend not running)
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
    []
  );

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
  const onLoad = useCallback(
    (mapInstance: google.maps.Map) => {
      setMap(mapInstance);
      // Initial fetch when map loads
      fetchStationsInBounds(mapInstance);
    },
    [fetchStationsInBounds]
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

  // Initialize directions service once when Maps is loaded
  useEffect(() => {
    if (!isLoaded) return;
    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new google.maps.DirectionsService();
    }
    // Notify parent once maps are ready
    onMapsReady && onMapsReady();
  }, [isLoaded]);

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

  // Calculate route whenever inputs change
  useEffect(() => {
    if (!isLoaded) return;
    if (!directionsServiceRef.current) return;
    if (!start && !originPlaceId) return; // need at least one origin signal
    if (!end && !destinationPlaceId) return; // need at least one destination signal

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

    if (!origin || !destination) return;

    directionsServiceRef.current.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirectionsResponse(result);
          const leg = result.routes[0].legs[0];
          setDistance(leg.distance?.text || null);
          setDuration(leg.duration?.text || null);
        } else {
          console.error("Directions request failed:", status);
          setDirectionsResponse(null);
          setDistance(null);
          setDuration(null);
        }
      }
    );
  }, [isLoaded, start, end, originPlaceId, destinationPlaceId, parseLatLng]);

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
      <GoogleMap
        center={initialCenter.current} //  only set once
        zoom={12}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        options={{ streetViewControl: false, mapTypeControl: false }}
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
              {selectedStation.operator && (
                <p>Operator: {selectedStation.operator}</p>
              )}
              {selectedStation.statusType && (
                <p>Status: {selectedStation.statusType}</p>
              )}
              {selectedStation.numberOfPoints && (
                <p>Points: {selectedStation.numberOfPoints}</p>
              )}

              {selectedStation.connections &&
                selectedStation.connections.length > 0 && (
                  <div>
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
          <p>
            Distance: <strong>{distance}</strong> – Duration:{" "}
            <strong>{duration}</strong>
          </p>
          {exceedsRange && (
            <p style={{ color: "red", fontWeight: "bold" }}>
              Route exceeds your battery range ({batteryRange} km)!
            </p>
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
            <h3
              style={{
                color: "#d32f2f",
                marginBottom: "16px",
                fontWeight: "bold",
              }}
            >
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