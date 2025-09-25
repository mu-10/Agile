import React, { useEffect, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
type Props = {
  onLocationChange: (loc: { lat: number; lng: number }) => void;
};
//const center = { lat: 57.7089, lng: 11.9746 }; // Gothenburg

export default function MapWeb({ onLocationChange }: Props) {
  useEffect(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      onLocationChange(loc); // 👈 update parent
    });
  }, [onLocationChange]);

  const [currentLocation, setCurrentLocation] =
    useState<google.maps.LatLngLiteral | null>(null);

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
        </GoogleMap>
      )}
    </div>
  );
}
