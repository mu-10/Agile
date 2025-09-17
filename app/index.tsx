import React, { useState } from "react";
import Map from "../components/Map.web"; // Use Map.web for web

export default function Index() {
  const [batteryRange, setBatteryRange] = useState("");
  const [destination, setDestination] = useState("");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: 32,
      }}
    >
      <div
        style={{
          width: 800,
          maxWidth: "95vw",
          padding: 10,
          backgroundColor: "rgba(0,0,0,0.6)",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h2 style={{ color: "#fff", marginBottom: 8 }}>EV-trip planer</h2>
        <input
          style={{
            backgroundColor: "#fff",
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
            width: "100%",
            border: "none",
            fontSize: 16,
          }}
          placeholder="Enter battery range (km)"
          type="number"
          value={batteryRange}
          onChange={e => setBatteryRange(e.target.value)}
        />
        <input
          style={{
            backgroundColor: "#fff",
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
            width: "100%",
            border: "none",
            fontSize: 16,
          }}
          placeholder="Enter destination"
          value={destination}
          onChange={e => setDestination(e.target.value)}
        />
      </div>
      <Map style={{ width: 800, maxWidth: "95vw", height: 400, borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
}