// services/stationConnectors.js

// List of connector types
const connectorTypes = [
  "CHAdeMO",
  "Type 2 (Socket Only)",
  "Type 1 (J1772)",
  "CCS (Type 2)",
  "Europlug 2-Pin (CEE 7/16)",
  "Tesla (Model S/X)",
  "NACS / Tesla Supercharger",
  "CEE 7/4 - Schuko - Type F",
  "Unknown",
  "IEC 60309 5-pin",
  "Type 2 (Tethered Connector) ",
  "IEC 60309 3-pin",
  "CEE 3 Pin"
];

module.exports = {
  connectorTypes
};
