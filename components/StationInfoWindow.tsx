import { InfoWindow } from '@react-google-maps/api';
import React from 'react';

interface StationInfoWindowProps {
  station: any;
  isVisible: boolean;
  onClose: () => void;
  isRecommended?: boolean;
  isDarkMode?: boolean;
}

const StationInfoWindow: React.FC<StationInfoWindowProps> = ({
  station,
  isVisible,
  onClose,
  isRecommended = false,
  isDarkMode = false
}) => {
  if (!isVisible || !station) {
    return null;
  }

  const styles = {
    container: {
      minWidth: 250,
      maxWidth: 350,
      background: isDarkMode ? "#18181b" : "#fff",
      color: isDarkMode ? "#d1d5db" : "#111827",
      borderRadius: "12px",
      padding: "16px",
      boxShadow: isDarkMode 
        ? "0 8px 25px rgba(0,0,0,0.4)" 
        : "0 8px 25px rgba(0,0,0,0.15)",
      fontSize: "14px",
      lineHeight: "1.5",
      fontFamily: "system-ui, -apple-system, sans-serif"
    },
    header: {
      margin: "0 0 12px 0",
      fontSize: "18px",
      fontWeight: "700",
      color: isDarkMode ? "#f3f4f6" : "#111827"
    },
    recommendedBadge: {
      backgroundColor: "#f0fdf4",
      border: "1px solid #bbf7d0",
      borderRadius: "6px",
      padding: "8px 12px",
      marginBottom: "12px",
      fontSize: "13px",
      fontWeight: "600",
      color: "#166534",
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    infoRow: {
      margin: "6px 0",
      fontSize: "13px",
      display: "flex",
      alignItems: "flex-start",
      gap: "8px"
    },
    label: {
      fontWeight: "600",
      color: isDarkMode ? "#9ca3af" : "#6b7280",
      minWidth: "80px",
      flexShrink: 0
    },
    value: {
      flex: 1,
      color: isDarkMode ? "#d1d5db" : "#374151"
    },
    routeInfo: {
      backgroundColor: isDarkMode ? "#1e293b" : "#f0f9ff",
      border: isDarkMode ? "1px solid #334155" : "1px solid #bfdbfe",
      borderRadius: "8px",
      padding: "12px",
      margin: "12px 0",
      fontSize: "13px"
    },
    chargingDetails: {
      backgroundColor: isDarkMode ? "#0f172a" : "#f0fdf4",
      border: isDarkMode ? "1px solid #1e293b" : "1px solid #bbf7d0",
      borderRadius: "8px",
      padding: "12px",
      marginTop: "12px",
      fontSize: "13px"
    },
    connectionsBox: {
      background: isDarkMode ? "#27272a" : "#f8f9fa",
      borderRadius: "8px",
      padding: "12px",
      marginTop: "12px",
      border: isDarkMode ? "1px solid #374151" : "1px solid #e9ecef"
    },
    connectionsList: {
      margin: "8px 0 0 0",
      paddingLeft: "0",
      listStyle: "none"
    },
    connectionItem: {
      marginBottom: "6px",
      padding: "6px 8px",
      backgroundColor: isDarkMode ? "#374151" : "#ffffff",
      borderRadius: "4px",
      fontSize: "12px",
      border: isDarkMode ? "1px solid #4b5563" : "1px solid #e5e7eb"
    },
    priceTag: {
      color: "#2563eb",
      fontWeight: "600",
      backgroundColor: isDarkMode ? "#1e3a8a" : "#f0f9ff",
      padding: "6px 12px",
      borderRadius: "6px",
      margin: "8px 0",
      display: "inline-block"
    }
  };

  const getBatteryColor = (percentage: number) => {
    if (percentage >= 50) return "#10b981"; // green
    if (percentage >= 20) return "#f59e0b"; // yellow
    return "#ef4444"; // red
  };

  const position = {
    lat: station.latitude || 0,
    lng: station.longitude || 0
  };
  
  // Safety check for valid coordinates
  if (!station.latitude || !station.longitude) {
    console.error('Invalid station coordinates:', station);
    return null;
  }

  return (
    <InfoWindow
      position={position}
      onCloseClick={onClose}
      options={{
        zIndex: 1001,
        pixelOffset: new window.google.maps.Size(0, -30),
        maxWidth: 400,
        disableAutoPan: false
      }}
    >
      <div style={styles.container}>
        {/* Recommended Badge */}
        {isRecommended && (
          <div style={styles.recommendedBadge}>
            <span>⭐</span>
            Recommended Charging Station
          </div>
        )}

        {/* Station Title */}
        <h3 style={styles.header}>
          {station.title || 'Charging Station'}
        </h3>

        {/* Basic Information */}
        {station.address && (
          <div style={styles.infoRow}>
            <span style={styles.label}>📍 Address:</span>
            <span style={styles.value}>{station.address}</span>
          </div>
        )}

        {station.town && (
          <div style={styles.infoRow}>
            <span style={styles.label}>🏙️ Location:</span>
            <span style={styles.value}>
              {station.town}{station.state ? `, ${station.state}` : ''}
            </span>
          </div>
        )}

        {station.operator && (
          <div style={styles.infoRow}>
            <span style={styles.label}>🏢 Operator:</span>
            <span style={styles.value}>{station.operator}</span>
          </div>
        )}

        {station.statusType && (
          <div style={styles.infoRow}>
            <span style={styles.label}>🔋 Status:</span>
            <span style={styles.value}>{station.statusType}</span>
          </div>
        )}

        {station.numberOfPoints && (
          <div style={styles.infoRow}>
            <span style={styles.label}>🔌 Points:</span>
            <span style={styles.value}>{station.numberOfPoints}</span>
          </div>
        )}

        {/* Pricing Information */}
        {station.usageCost && (
          <div style={styles.priceTag}>
            💳 {station.usageCost}
          </div>
        )}

        {/* Route Information */}
        {station.routeKm !== undefined && (
          <div style={styles.routeInfo}>
            <div style={{ fontWeight: "600", marginBottom: "8px" }}>📍 Route Information</div>
            <div style={styles.infoRow}>
              <span style={styles.label}>Distance:</span>
              <span style={styles.value}>{station.routeKm.toFixed(1)} km along route</span>
            </div>
            {station.routeDeviationKm !== undefined && (
              <div style={styles.infoRow}>
                <span style={styles.label}>Deviation:</span>
                <span style={styles.value}>{station.routeDeviationKm.toFixed(1)} km from route</span>
              </div>
            )}
          </div>
        )}

        {/* Charging Details for Recommended Station */}
        {isRecommended && station.batteryPercentAtArrival !== undefined && (
          <div style={styles.chargingDetails}>
            <div style={{ fontWeight: "600", marginBottom: "8px" }}>⚡ Charging Details</div>
            
            <div style={styles.infoRow}>
              <span style={styles.label}>Battery on arrival:</span>
              <span 
                style={{
                  ...styles.value,
                  fontWeight: "600",
                  color: getBatteryColor(station.batteryPercentAtArrival)
                }}
              >
                {station.batteryPercentAtArrival}%
              </span>
            </div>

            {station.maxPowerKW && (
              <div style={styles.infoRow}>
                <span style={styles.label}>Max Power:</span>
                <span style={styles.value}>{station.maxPowerKW} kW</span>
              </div>
            )}

            {station.estimatedChargingTimeMinutes && (
              <div style={styles.infoRow}>
                <span style={styles.label}>Charging Time:</span>
                <span style={styles.value}>{station.estimatedChargingTimeMinutes} min</span>
              </div>
            )}

            {station.distanceFromStart && (
              <div style={styles.infoRow}>
                <span style={styles.label}>From start:</span>
                <span style={styles.value}>{station.distanceFromStart} km</span>
              </div>
            )}

            {station.actualDetour !== undefined && (
              <div style={styles.infoRow}>
                <span style={styles.label}>Detour:</span>
                <span 
                  style={{
                    ...styles.value,
                    color: station.actualDetour > 0 ? "#ef4444" : "#10b981",
                    fontWeight: "600"
                  }}
                >
                  {station.actualDetour > 0 
                    ? `+${station.actualDetour} km` 
                    : station.actualDetour === 0 
                    ? 'No detour' 
                    : `${Math.abs(station.actualDetour)} km shorter`}
                </span>
              </div>
            )}

            {station.remainingRangeAtDestination && (
              <div style={styles.infoRow}>
                <span style={styles.label}>Range at destination:</span>
                <span style={styles.value}>{station.remainingRangeAtDestination} km</span>
              </div>
            )}
          </div>
        )}

        {/* Connection Types */}
        {station.connections && Array.isArray(station.connections) && station.connections.length > 0 && (
          <div style={styles.connectionsBox}>
            <div style={{ fontWeight: "600", marginBottom: "8px" }}>🔌 Connection Types</div>
            <ul style={styles.connectionsList}>
              {station.connections.map((conn: any, idx: number) => (
                <li key={idx} style={styles.connectionItem}>
                  <div style={{ fontWeight: "600" }}>{conn.type || 'Unknown'}</div>
                  <div style={{ fontSize: "11px", color: isDarkMode ? "#9ca3af" : "#6b7280" }}>
                    {conn.powerKW && <span>{conn.powerKW} kW</span>}
                    {conn.level && <span> • {conn.level}</span>}
                    {conn.quantity && conn.quantity > 1 && <span> • Qty: {conn.quantity}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </InfoWindow>
  );
};

export default StationInfoWindow;