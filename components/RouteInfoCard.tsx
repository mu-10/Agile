import React from 'react';

interface RouteInfoCardProps {
  // Basic route info
  distance?: string | null;
  duration?: string | null;
  
  // Charging info
  chargingStopInfo?: any;
  allChargingStops?: any[];
  showChargingRoute?: boolean;
  loadingChargingStop?: boolean;
  batteryRange?: number;
  batteryCapacity?: number;
  
  // Display options
  isDarkMode?: boolean;
  
  // Event handlers
  onStationClick?: (station: any) => void;
}

const RouteInfoCard: React.FC<RouteInfoCardProps> = ({
  distance,
  duration,
  chargingStopInfo,
  allChargingStops = [],
  showChargingRoute = false,
  loadingChargingStop = false,
  batteryRange = 0,
  batteryCapacity = 0,
  isDarkMode = false,
  onStationClick
}) => {
  // Don't render if no relevant info
  if (!((distance && duration) || (chargingStopInfo && chargingStopInfo.needsCharging) || (allChargingStops.length > 0))) {
    return null;
  }

  const styles = {
    card: {
      position: "absolute" as const,
      top: 20,
      left: 20,
      background: isDarkMode ? "#1f2937" : "#fff",
      color: isDarkMode ? "#f9fafb" : "#111827",
      padding: "16px",
      borderRadius: "8px",
      boxShadow: isDarkMode 
        ? "0 4px 12px rgba(0,0,0,0.3)" 
        : "0 4px 12px rgba(0,0,0,0.15)",
      border: isDarkMode ? "1px solid #374151" : "1px solid #dadce0",
      fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
      fontSize: "14px",
      minWidth: "240px",
      maxWidth: "340px",
      maxHeight: "70vh",
      overflowY: "auto" as const,
      zIndex: 1000,
    },
    summaryRow: {
      display: "flex",
      alignItems: "center",
      marginBottom: "4px"
    },
    routeType: {
      fontSize: "13px",
      color: "#1976d2",
      marginBottom: "4px"
    },
    detailText: {
      fontSize: "12px",
      color: isDarkMode ? "#9ca3af" : "#5f6368"
    },
    stepContainer: {
      display: "flex",
      marginBottom: "12px"
    },
    stepIcon: {
      width: "24px",
      height: "24px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginRight: "12px",
      flexShrink: 0,
      fontSize: "12px",
      fontWeight: "600"
    },
    stepContent: {
      flex: 1
    },
    divider: {
      borderTop: isDarkMode ? "1px solid #374151" : "1px solid #e8eaed",
      paddingTop: "12px"
    },
    stationBox: {
      backgroundColor: isDarkMode ? "#374151" : "#f8f9fa",
      border: isDarkMode ? "1px solid #4b5563" : "1px solid #e8eaed",
      borderRadius: "8px",
      padding: "12px",
      marginTop: "8px",
      cursor: "pointer",
      transition: "all 0.2s ease"
    },
    stationBoxHover: {
      backgroundColor: isDarkMode ? "#4b5563" : "#e8eaed",
      transform: "translateY(-1px)"
    }
  };

  // Multi-stop route rendering
  if (allChargingStops.length > 1) {
    const drivingTime = chargingStopInfo?.estimatedTime || 0;
    // Use consistent distance from props (same as single-stop case)
    const consistentDistance = distance ? parseFloat(distance.replace(/[^\d.]/g, '')) : (chargingStopInfo?.totalDistance || 0);
    const chargingTime = allChargingStops.length * 45; // 45 min per stop
    const totalTime = drivingTime + chargingTime; // Include charging time like single-stop case
    const extraTime = chargingTime + 10; // Approximate extra time
    
    // Calculate remaining range at destination for multi-stop routes
    // After the last charging stop, the battery is charged to 80% (batteryCapacity * 0.8)
    // We need to estimate the distance from last charging stop to destination
    const lastStop = allChargingStops[allChargingStops.length - 1];
    // Rough estimate: if we have consistentDistance and multiple stops, 
    // assume the last segment is about 1/3 of battery capacity distance
    const estimatedDistanceFromLastStop = Math.min(consistentDistance * 0.3, batteryCapacity * 0.8);
    const remainingRangeAtDestination = Math.max(0, batteryCapacity * 0.8 - estimatedDistanceFromLastStop);

    return (
      <div style={styles.card}>
        {/* Total Trip Summary */}
        <div style={{ marginBottom: "16px" }}>
          <div style={styles.summaryRow}>
            <span style={{ fontSize: "20px", fontWeight: "600", marginRight: "8px" }}>
              {Math.round(totalTime)} min
            </span>
            <span style={{ fontSize: "16px", color: isDarkMode ? "#d1d5db" : "#5f6368" }}>
              ({consistentDistance.toFixed(1)} km)
            </span>
          </div>
          
          <div style={styles.detailText}>
            Range at start: {batteryRange} km
            {chargingStopInfo?.rangeAtArrival !== undefined && (
              ` • Range at arrival: ${Math.round(chargingStopInfo.rangeAtArrival)} km`
            )}
          </div>
          
          <div style={styles.routeType}>
            Fastest route with charging • via {allChargingStops.length} charging stops
          </div>
          
          <div style={styles.detailText}>
            +{extraTime} min longer than usual due to charging
          </div>
          
          <div style={styles.detailText}>
            No detour required
          </div>
        </div>

        {/* Route Steps */}
        <div style={styles.divider}>
          {/* Start */}
          <div style={styles.stepContainer}>
            <div style={{
              ...styles.stepIcon,
              backgroundColor: "#4285f4",
              color: "#fff"
            }}>
              🚗
            </div>
            <div style={styles.stepContent}>
              <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                Start your journey
              </div>
              <div style={styles.detailText}>
                Begin with {batteryRange} km range
              </div>
            </div>
          </div>

          {/* Charging Stops */}
          {allChargingStops.map((stop, index) => (
            <div key={index}>
              <div style={styles.stepContainer}>
                <div style={{
                  ...styles.stepIcon,
                  backgroundColor: index === 0 ? "#ff9800" : "#f57c00",
                  color: "#fff"
                }}>
                  ⚡
                </div>
                <div style={styles.stepContent}>
                  <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                    Charging stop #{index + 1}
                  </div>
                  <div style={styles.detailText}>
                    Charge for ~45 min (80%)
                  </div>
                  <div 
                    style={styles.stationBox}
                    onClick={() => onStationClick && onStationClick(stop)}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, styles.stationBoxHover);
                    }}
                    onMouseLeave={(e) => {
                      Object.assign(e.currentTarget.style, styles.stationBox);
                    }}
                    title="Click to navigate to this charging station"
                  >
                    <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                      {stop.title}
                    </div>
                    <div style={styles.detailText}>
                      {stop.address}
                    </div>
                    {stop.connections && stop.connections.length > 0 && (
                      <div style={styles.detailText}>
                        Connectors: {stop.connections.map((c: any) => c.type).join(", ")}
                      </div>
                    )}
                    {stop.batteryAtArrival !== undefined && (
                      <div style={styles.detailText}>
                        Battery on arrival: {Math.round(stop.batteryAtArrival)}%
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Destination */}
          <div style={styles.stepContainer}>
            <div style={{
              ...styles.stepIcon,
              backgroundColor: "#34a853",
              color: "#fff"
            }}>
              🏁
            </div>
            <div style={styles.stepContent}>
              <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                Arrive at destination
              </div>
              <div style={styles.detailText}>
                {Math.round(remainingRangeAtDestination)} km range remaining
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Single charging stop rendering
  if (showChargingRoute && chargingStopInfo?.routeDetails) {
    const routeDetails = chargingStopInfo.routeDetails;
    
    return (
      <div style={styles.card}>
        {/* Total Trip Summary */}
        <div style={{ marginBottom: "16px" }}>
          <div style={styles.summaryRow}>
            <span style={{ fontSize: "20px", fontWeight: "600", marginRight: "8px" }}>
              {routeDetails.totalTravelTime} min
            </span>
            <span style={{ fontSize: "16px", color: isDarkMode ? "#d1d5db" : "#5f6368" }}>
              ({Math.round(routeDetails.totalDistanceViaStation)} km)
            </span>
          </div>
          
          <div style={styles.detailText}>
            Range at start: {batteryRange} km
            {routeDetails.remainingRangeAtDestination !== 'Unknown' && (
              ` • Range at arrival: ${routeDetails.remainingRangeAtDestination}`
            )}
          </div>
          
          <div style={styles.routeType}>
            Fastest route with charging • via {chargingStopInfo.chargingStation?.title || 'charging station'}
          </div>
          
          <div style={styles.detailText}>
            +{routeDetails.totalTravelTime - routeDetails.originalTravelTime} min longer than usual due to charging
          </div>
          
          {routeDetails.actualDetour > 0 ? (
            <div style={styles.detailText}>
              +{routeDetails.actualDetour.toFixed(1)} km detour for charging
            </div>
          ) : (
            <div style={styles.detailText}>
              No detour required
            </div>
          )}
        </div>

        {/* Route Steps */}
        <div style={styles.divider}>
          {/* Drive to charging station */}
          <div style={styles.stepContainer}>
            <div style={{
              ...styles.stepIcon,
              backgroundColor: "#ff6b35",
              color: "#fff"
            }}>
              🚗
            </div>
            <div style={styles.stepContent}>
              <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                Drive to charging station
              </div>
              <div style={styles.detailText}>
                {routeDetails.timeToStation} min • {routeDetails.originalDistance}
              </div>
            </div>
          </div>

          {/* Charging stop */}
          <div style={styles.stepContainer}>
            <div style={{
              ...styles.stepIcon,
              backgroundColor: "#ff9800",
              color: "#fff"
            }}>
              ⚡
            </div>
            <div style={styles.stepContent}>
              <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                Charge at station
              </div>
              <div style={styles.detailText}>
                45 min (80%) charging time
              </div>
              <div 
                style={styles.stationBox}
                onClick={() => onStationClick && onStationClick(chargingStopInfo.chargingStation)}
                onMouseEnter={(e) => {
                  Object.assign(e.currentTarget.style, styles.stationBoxHover);
                }}
                onMouseLeave={(e) => {
                  Object.assign(e.currentTarget.style, styles.stationBox);
                }}
                title="Click to navigate to this charging station"
              >
                <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                  {chargingStopInfo.chargingStation?.title}
                </div>
                <div style={styles.detailText}>
                  {chargingStopInfo.chargingStation?.address}
                </div>
                {chargingStopInfo.chargingStation?.connections && (
                  <div style={styles.detailText}>
                    Connectors: {chargingStopInfo.chargingStation.connections.map((c: any) => c.type).join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Drive to destination */}
          <div style={styles.stepContainer}>
            <div style={{
              ...styles.stepIcon,
              backgroundColor: "#34a853",
              color: "#fff"
            }}>
              🏁
            </div>
            <div style={styles.stepContent}>
              <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                Arrive at destination
              </div>
              <div style={styles.detailText}>
                {chargingStopInfo?.rangeAtArrival !== undefined 
                  ? `${Math.round(chargingStopInfo.rangeAtArrival)} km range remaining`
                  : routeDetails.remainingRangeAtDestination !== 'Unknown' 
                    ? `${routeDetails.remainingRangeAtDestination} range remaining`
                    : (() => {
                        // Calculate remaining range: Battery capacity after charging to 80% - distance from station to destination
                        const distanceFromStationText = routeDetails.distanceToEnd || '';
                        const distanceFromStationKm = parseFloat(distanceFromStationText.replace(/[^\d.]/g, '')) || 0;
                        const remainingRange = Math.max(0, batteryCapacity * 0.8 - distanceFromStationKm);
                        return `${Math.round(remainingRange)} km range remaining`;
                      })()
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No charging needed - direct route
  if (!showChargingRoute && chargingStopInfo && chargingStopInfo.needsCharging === false) {
    const totalDistance = Number(chargingStopInfo.totalDistance);
    const batteryRangeStart = Number(batteryRange);
    const rangeAtArrival = chargingStopInfo.rangeAtArrival !== undefined 
      ? Number(chargingStopInfo.rangeAtArrival)
      : batteryRangeStart - totalDistance;
    const percentAtArrival = chargingStopInfo.percentAtArrival !== undefined
      ? Number(chargingStopInfo.percentAtArrival)
      : batteryRangeStart > 0 ? (rangeAtArrival / batteryRangeStart) * 100 : 0;
    const estimatedTime = Number(chargingStopInfo.estimatedTime);

    return (
      <div style={styles.card}>
        <div style={{ marginBottom: "8px" }}>
          <div style={styles.summaryRow}>
            <span style={{ fontSize: "20px", fontWeight: "600", marginRight: "8px" }}>
              {estimatedTime} min
            </span>
            <span style={{ fontSize: "16px", color: isDarkMode ? "#d1d5db" : "#5f6368" }}>
              ({totalDistance} km)
            </span>
          </div>
          <div style={styles.routeType}>
            Fastest route
          </div>
          <div style={styles.detailText}>
            No charging needed • {Math.round(rangeAtArrival)} km ({Math.round(percentAtArrival)}%) range remaining
          </div>
        </div>
      </div>
    );
  }

  // Fallback: basic route info
  if (distance && duration) {
    // Calculate remaining range
    const distanceInKm = parseFloat(distance.replace(/[^\d.]/g, "")) || 0;
    const remainingRange = batteryRange > 0 ? Math.max(0, batteryRange - distanceInKm) : 0;
    
    return (
      <div style={styles.card}>
        <div style={{ marginBottom: "8px" }}>
          <div style={styles.summaryRow}>
            <span style={{ fontSize: "20px", fontWeight: "600", marginRight: "8px" }}>
              {duration}
            </span>
            <span style={{ fontSize: "16px", color: isDarkMode ? "#d1d5db" : "#5f6368" }}>
              ({distance})
            </span>
          </div>
          <div style={styles.routeType}>
            Fastest route
          </div>
          {batteryRange > 0 && (
            <div style={styles.detailText}>
              {Math.round(remainingRange)} km range remaining
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (loadingChargingStop) {
    return (
      <div style={styles.card}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 0"
        }}>
          <div style={{
            width: "16px",
            height: "16px",
            border: `2px solid ${isDarkMode ? "#4b5563" : "#d1d5db"}`,
            borderTop: "2px solid #4285f4",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }}></div>
          <span style={{ color: "#4285f4", fontSize: "14px", fontWeight: "500" }}>
            Finding optimal charging station...
          </span>
        </div>
      </div>
    );
  }

  return null;
};

export default RouteInfoCard;