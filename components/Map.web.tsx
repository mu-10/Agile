import {
  DirectionsRenderer,
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import React, { useEffect, useRef, useState } from "react";

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

  const [directionsResponse, setDirectionsResponse] =
    useState<google.maps.DirectionsResult | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);

  // store the initial map center so it doesn't keep re-centering
  const initialCenter = useRef<google.maps.LatLngLiteral | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY!,
  });

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

  // Fetch charging stations
  useEffect(() => {
    fetch("http://localhost:3001/api/charging-stations")
      .then((res) => res.json())
      .then((data) => {
        setStations(data);
        setLoadingStations(false);
      })
      .catch((err) => {
        console.error("Error fetching stations:", err);
        setLoadingStations(false);
      });
  }, []);

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
  if (!isLoaded || !initialCenter.current) return <div>Loading map…</div>;

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <GoogleMap
        center={initialCenter.current} //  only set once
        zoom={12}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        options={{ streetViewControl: false, mapTypeControl: false }}
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
              ⚠️ Route exceeds your battery range ({batteryRange} km)!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
