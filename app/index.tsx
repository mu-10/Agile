import { Ionicons } from "@expo/vector-icons"; // for search/plan icon
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Map from "../components/Map.web";

export default function Index() {
  // 🔹 Explicitly typed states
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [batteryRange, setBatteryRange] = useState<string>("");
  const [rangeError, setRangeError] = useState<string>("");
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // 🔹 Fix: typed parameter
  const handleRangeChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, ""); // only keep numbers
    setBatteryRange(numericValue);

    if (numericValue === "") {
      setRangeError("Range must be a number");
    } else {
      setRangeError("");
    }
  };

  const onPlan = () => {
    if (!batteryRange || isNaN(Number(batteryRange))) {
      setRangeError("Please enter a valid number for battery range");
      return;
    }
    setRangeError("");
    console.log("Start:", start, "End:", end, "Battery Range:", batteryRange);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Unified Search Bar */}
      <View style={styles.toolbar}>
        <Ionicons
          name="navigate-outline"
          size={18}
          color="#9ca3af"
          style={styles.icon}
        />
        <TextInput
          style={styles.input}
          placeholder="From"
          placeholderTextColor="#9ca3af"
          value={start}
          onChangeText={setStart}
        />
        <View style={styles.divider} />
        <TextInput
          style={styles.input}
          placeholder="To"
          placeholderTextColor="#9ca3af"
          value={end}
          onChangeText={setEnd}
        />
        <View style={styles.divider} />
        <TextInput
          style={styles.input}
          placeholder="Range km"
          placeholderTextColor="#9ca3af"
          value={batteryRange}
          keyboardType="numeric"
          onChangeText={handleRangeChange} // ✅ typed
        />

        <Pressable
          onPress={onPlan}
          disabled={!start || !end || !batteryRange || !!rangeError}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (!start || !end || !batteryRange || !!rangeError) &&
              styles.buttonDisabled,
          ]}
        >
          <Ionicons
            name="car-sport-outline"
            size={16}
            color="white"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.buttonText}>Plan</Text>
        </Pressable>
      </View>

      {rangeError ? <Text style={styles.error}>{rangeError}</Text> : null}

      {/* Map */}
      <View style={{ flex: 1 }}>
        <Map
          onLocationChange={(loc) =>
            setStart(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`)
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Google-style unified toolbar
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

  icon: {
    marginRight: 6,
    marginLeft: 2,
  },

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

  // Plan button
  button: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 30,
    backgroundColor: "#22c55e", // fallback if gradient not supported
    shadowColor: "#22c55e",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonPressed: {
    backgroundColor: "#16a34a",
  },
  buttonDisabled: {
    backgroundColor: "#a7f3d0",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 15,
    fontFamily: "System",
  },

  // Error
  error: {
    color: "red",
    fontSize: 13,
    marginLeft: 20,
    marginTop: -4,
  },
});
