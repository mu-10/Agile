import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import React, { useEffect, useState } from "react";

//const center = { lat: 57.7089, lng: 11.9746 }; // Gothenburg

export default function MapWeb() {
  const [currentLocation, setCurrentLocation] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);

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
      setCurrentLocation({ lat: 57.7089, lng: 11.9746 }); // fallback
    }
  }, []);

  useEffect(() => {
    // Fetch charging stations in Sweden from Open Charge Map
    fetch(
      "https://api.openchargemap.io/v3/poi/?output=json&countrycode=SE&maxresults=500"
    )
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
          zoom={6}
          mapContainerStyle={{ width: "100%", height: "100%" }}
        >
          <Marker position={currentLocation} title="You are here" />
          {/* Charging station markers */}
          {!loadingStations &&
            stations.map((station: any) => (
              <Marker
                key={station.ID}
                position={{
                  lat: station.AddressInfo.Latitude,
                  lng: station.AddressInfo.Longitude,
                }}
                title={station.AddressInfo.Title}
              />
            ))}
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
