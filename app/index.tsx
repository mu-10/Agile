import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MapWeb from "../components/Map.web";

export default function Index() {
  // Input states
  const [startInput, setStartInput] = useState<string>("");
  const [startCoords, setStartCoords] = useState<string | null>(null);
  const [end, setEnd] = useState<string>("");
  const [batteryRange, setBatteryRange] = useState<string>("");
  const [rangeError, setRangeError] = useState<string>("");

  // Track GPS location from MapWeb
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Store the route only when Plan is pressed
  const [plannedStart, setPlannedStart] = useState<string | null>(null);
  const [plannedEnd, setPlannedEnd] = useState<string | null>(null);
  const [plannedRange, setPlannedRange] = useState<number>(0);

  // Handle numeric input
  const handleRangeChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, "");
    setBatteryRange(numericValue);
    setRangeError(numericValue === "" ? "Range must be a number" : "");
  };

  // Plan button
  const onPlan = () => {
    if (!batteryRange || isNaN(Number(batteryRange))) {
      setRangeError("Please enter a valid number for battery range");
      return;
    }
    setRangeError("");

    // Lock in the planned values
    setPlannedStart(startCoords || startInput);
    setPlannedEnd(end);
    setPlannedRange(Number(batteryRange));

    console.log("Planned route:", {
      start: startCoords || startInput,
      end,
      batteryRange,
    });
  };

  // Fill input with current location on button press
  const useCurrentLocation = async () => {
    if (!currentLocation) return;
    const loc = currentLocation;
    setStartCoords(`${loc.lat},${loc.lng}`);

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.lat},${loc.lng}&key=YOUR_GOOGLE_MAPS_API_KEY`
      );
      const json = await res.json();
      if (json.results && json.results.length > 0) {
        setStartInput(json.results[0].formatted_address);
      } else {
        setStartInput("Current location");
      }
    } catch (err) {
      console.error("Reverse geocoding failed:", err);
      setStartInput("Current location");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Ionicons name="navigate-outline" size={18} color="#9ca3af" style={styles.icon} />

        {/* From input with location button */}
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="From"
            placeholderTextColor="#9ca3af"
            value={startInput}
            onChangeText={(val) => {
              setStartInput(val);
              setStartCoords(null);
            }}
          />
          {currentLocation && (
            <Pressable
              onPress={useCurrentLocation}
              style={{
                padding: 4,
                marginLeft: 4,
                backgroundColor: "#22c55e",
                borderRadius: 20,
              }}
            >
              <Ionicons name="location-outline" size={20} color="white" />
            </Pressable>
          )}
        </View>

        <View style={styles.divider} />

        {/* To input */}
        <TextInput
          style={styles.input}
          placeholder="To"
          placeholderTextColor="#9ca3af"
          value={end}
          onChangeText={setEnd}
        />

        <View style={styles.divider} />

        {/* Battery range */}
        <TextInput
          style={styles.input}
          placeholder="Range km"
          placeholderTextColor="#9ca3af"
          value={batteryRange}
          keyboardType="numeric"
          onChangeText={handleRangeChange}
        />

        {/* Plan button */}
        <Pressable
          onPress={onPlan}
          disabled={!startInput || !end || !batteryRange || !!rangeError}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (!startInput || !end || !batteryRange || !!rangeError) && styles.buttonDisabled,
          ]}
        >
          <Ionicons name="car-sport-outline" size={16} color="white" style={{ marginRight: 4 }} />
          <Text style={styles.buttonText}>Plan</Text>
        </Pressable>
      </View>

      {rangeError ? <Text style={styles.error}>{rangeError}</Text> : null}

      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapWeb
          start={plannedStart || ""}   // only sends planned values
          end={plannedEnd || ""}
          batteryRange={plannedRange}
          onLocationChange={(loc) => setCurrentLocation(loc)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    margin: 12,
    borderRadius: 40,
    paddingHorizontal: 14,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  icon: { marginRight: 6, marginLeft: 2 },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "System",
    paddingVertical: 10,
    paddingHorizontal: 8,
    color: "#111827",
  },
  divider: {
    width: 1,
    height: "60%",
    backgroundColor: "#e5e7eb",
    marginHorizontal: 6,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 30,
    backgroundColor: "#22c55e",
    shadowColor: "#22c55e",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonPressed: { backgroundColor: "#16a34a" },
  buttonDisabled: { backgroundColor: "#a7f3d0" },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 15,
    fontFamily: "System",
  },
  error: { color: "red", fontSize: 13, marginLeft: 20, marginTop: -4 },
});
