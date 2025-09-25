import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from "@react-google-maps/api";
import React, { useEffect, useState } from "react";

type Props = {
  onLocationChange: (loc: { lat: number; lng: number }) => void;
};

const chargingIcon = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";

export default function MapWeb({ onLocationChange }: Props) {
  const [currentLocation, setCurrentLocation] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);

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
        },
        (err) => {
          console.error("Error getting location:", err);
          const fallback = { lat: 57.7089, lng: 11.9746 };
          setCurrentLocation(fallback);
          onLocationChange(fallback);
        }
      );
    } else {
      console.error("Geolocation not supported");
      const fallback = { lat: 57.7089, lng: 11.9746 };
      setCurrentLocation(fallback);
      onLocationChange(fallback);
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

  if (loadError)
    return <div>Failed to load Google Maps: {String(loadError)}</div>;
  if (!isLoaded) return <div>Loading map…</div>;

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      {currentLocation && (
        <GoogleMap
          center={currentLocation}
          zoom={12}
          mapContainerStyle={{ width: "100%", height: "100%" }}
        >
          <Marker position={currentLocation} title="You are here" />

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
                {selectedStation.postcode && <p>{selectedStation.postcode}</p>}

                {selectedStation.connections &&
                  selectedStation.connections.length > 0 && (
                    <div>
                      <strong>Chargers:</strong>{" "}
                      {selectedStation.connections.length}
                      <ul>
                        {selectedStation.connections.map((conn: any, idx: number) => (
                          <li key={idx}>
                            {conn.type} - {conn.powerKW ? `${conn.powerKW} kW` : "N/A"}
                            {conn.quantity ? ` (${conn.quantity}x)` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {selectedStation.relatedUrl && (
                  <p>
                    <a
                      href={selectedStation.relatedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      More info
                    </a>
                  </p>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      )}

      {loadingStations && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            padding: "1em",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          Loading charging stations…
        </div>
      )}
    </div>
  );
}
