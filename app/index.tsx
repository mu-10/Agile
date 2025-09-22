import React, { useState } from "react"; // NEW STUFF START (added useState)
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"; // added TextInput, StyleSheet, Pressable
// NEW STUFF END
import Map from "../components/Map"; // <- correct if components/ is at project root

export default function Index() {
  // NEW STUFF START
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [batteryRange, setBatteryRange] = useState(""); 
  const [rangeError, setRangeError] = useState(""); // Error state

   const handleRangeChange = (text: string) => {
    // Only allow numbers
    if (/^\d*$/.test(text)) {
      setBatteryRange(text);
      setRangeError("");
    } else {
      setRangeError("Battery range must be a number");
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
  // NEW STUFF END

  return (
    <View style={{ flex: 1 }}>
      {/* NEW STUFF START - inputs ABOVE the map */}
      <View style={styles.form}>
        <Text style={styles.title}>Chargify</Text>

        <Text style={styles.label}>From:</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Stockholm"
          value={start}
          onChangeText={setStart}
        />

        <Text style={styles.label}>To(Destination):</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Gothenburg"
          value={end}
          onChangeText={setEnd}
        />

       <Text style={styles.label}>Battery range (km)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 350"
          value={batteryRange}
          onChangeText={handleRangeChange}
          keyboardType="numeric"
        />
        {rangeError ? (
          <Text style={{ color: "red", marginBottom: 4 }}>{rangeError}</Text>
        ) : null}

         <Pressable
          onPress={onPlan}
          style={[
            styles.button,
            (!start || !end || !batteryRange || !!rangeError) && styles.buttonDisabled,
          ]}
          disabled={!start || !end || !batteryRange || !!rangeError}
        >
          <Text style={styles.buttonText}>Plan Trip</Text>
        </Pressable>
      </View>
      {/* NEW STUFF END */}

      {/* Map BELOW the inputs, no overlays */}
      <View style={{ flex: 1 }}>
        <Map />
      </View>
    </View>
  );
}

// NEW STUFF START
const styles = StyleSheet.create({
  form: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  label: { fontSize: 14, fontWeight: "600", color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#2e7d32",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
});
// NEW STUFF END
