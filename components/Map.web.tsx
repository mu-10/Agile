import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from "@react-google-maps/api";
import React, { useEffect, useState } from "react";
const chargingIcon = "https://i.imgur.com/BeCzKCh.png";
//const center = { lat: 57.7089, lng: 11.9746 }; // Gothenburg

export default function MapWeb() {
  const [currentLocation, setCurrentLocation] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY!,
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          console.error("Error getting location:", err);
          // fallback: Gothenburg
          setCurrentLocation({ lat: 57.7089, lng: 11.9746 });
        }
      );
    } else {
      console.error("Geolocation not supported");
      setCurrentLocation({ lat: 57.7089, lng: 11.9746 });
    }
  }, []);

  useEffect(() => {
    fetch("http://localhost:3001/api/charging-stations")
      .then((res) => res.json())
      .then((data) => {
        setStations(data);
        setLoadingStations(false);
      })
      .catch(() => setLoadingStations(false));
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
          {/* Charging station markers */}
          {!loadingStations &&
            Array.isArray(stations) &&
            stations.map((station: any) => (
              <Marker
                key={station.id}
                position={{
                  lat: station.latitude,
                  lng: station.longitude,
                }}
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
                lat: selectedStation.AddressInfo.Latitude,
                lng: selectedStation.AddressInfo.Longitude,
              }}
              onCloseClick={() => setSelectedStation(null)}
            >
              <div style={{ minWidth: 200 }}>
                <h4>{selectedStation.title}</h4>
                <p>{selectedStation.address}</p>
                <p>
                  {selectedStation.town}, {selectedStation.state}
                </p>
                <p>{selectedStation.postcode}</p>
                <p>
                  {selectedStation.AddressInfo.Town},{" "}
                  {selectedStation.AddressInfo.StateOrProvince}
                </p>
                <p>{selectedStation.AddressInfo.Postcode}</p>
                {/* Show connection info */}
                {selectedStation.Connections && selectedStation.Connections.length > 0 && (
                  <div>
                    <strong>Chargers:</strong> {selectedStation.Connections.length}
                    <ul>
                      {selectedStation.Connections.map((conn: any, idx: number) => (
                        <li key={idx}>
                          {conn.ConnectionType?.Title} - {conn.PowerKW ? `${conn.PowerKW} kW` : "N/A"}
                          {conn.Quantity ? ` (${conn.Quantity}x)` : ""}
                          {conn.Price ? `, Price: ${conn.Price}` : ""}
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
