import React from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const center = { lat: 57.7089, lng: 11.9746 }; // Gothenburg

export default function MapWeb() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY!,
  });
  if (loadError)
    return <div>Failed to load Google Maps: {String(loadError)}</div>;
  if (!isLoaded) return <div>Loading map…</div>;

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <GoogleMap
        center={center}
        zoom={12}
        mapContainerStyle={{ width: "100%", height: "100%" }}
      >
        <Marker position={center} title="Gothenburg" />
      </GoogleMap>
    </div>
  );
}
