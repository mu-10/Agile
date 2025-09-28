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
};

const chargingIcon = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";

export default function MapWeb({ onLocationChange, start, end, batteryRange }: Props) {
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [backendError, setBackendError] = useState<boolean>(false);

  const [directionsResponse, setDirectionsResponse] =
    useState<google.maps.DirectionsResult | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);

  // store the initial map center so it doesn't keep re-centering
  const initialCenter = useRef<google.maps.LatLngLiteral | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY!,
    libraries: ['places'], // Only load needed libraries
  });

  // Function to fetch stations based on map bounds
  const fetchStationsInBounds = useCallback(async (mapInstance: google.maps.Map) => {
    const bounds = mapInstance.getBounds();
    if (!bounds) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    const params = new URLSearchParams({
      north: ne.lat().toString(),
      south: sw.lat().toString(),
      east: ne.lng().toString(),
      west: sw.lng().toString(),
      maxResults: '200'
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
  }, []);

  // Debounced bounds change handler
  const debouncedFetchStations = useRef<number | null>(null);
  const onBoundsChanged = useCallback(() => {
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
  }, [map, fetchStationsInBounds]);

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

  // Calculate route whenever start/end changes
  useEffect(() => {
    if (!isLoaded || !start || !end) return;

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: start,
        destination: end,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirectionsResponse(result);
          const leg = result.routes[0].legs[0];
          setDistance(leg.distance?.text || null);
          setDuration(leg.duration?.text || null);
        } else {
          console.error("Directions request failed:", status);
        }
      }
    );
  }, [isLoaded, start, end]);

  // Battery range check
  const exceedsRange =
    distance && batteryRange
      ? parseFloat(distance.replace(/[^\d.]/g, "")) > batteryRange
      : false;

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

        {/* Route */}
        {directionsResponse && (
          <DirectionsRenderer
            directions={directionsResponse}
            options={{ preserveViewport: true }} // prevents auto-recenter on route
          />
        )}

        {/* Charging station markers */}
        {!loadingStations &&
          Array.isArray(stations) &&
          stations.map((station: any) => (
            <Marker
              key={station.id}
              position={{ lat: station.latitude, lng: station.longitude }}
              title={station.title}
              icon={{
                url: chargingIcon,
                scaledSize: new window.google.maps.Size(32, 32),
              }}
              onClick={() => setSelectedStation(station)}
            />
          ))}

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
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Route info + battery warning */}
      {distance && duration && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            padding: "10px 16px",
            borderRadius: "12px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          <p>
            Distance: <strong>{distance}</strong> – Duration: <strong>{duration}</strong>
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
