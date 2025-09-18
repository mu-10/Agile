import React, { useState } from "react"; // NEW STUFF START (added useState)
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"; // added TextInput, StyleSheet, Pressable
// NEW STUFF END
import Map from "../components/Map"; // <- correct if components/ is at project root

export default function Index() {
  // NEW STUFF START
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [batteryRange, setBatteryRange] = useState(""); 

  const onPlan = () => {
    console.log("Start:", start, "End:", end);
  };
  // NEW STUFF END

  return (
    <View style={{ flex: 1 }}>
      {/* NEW STUFF START - inputs ABOVE the map */}
      <View style={styles.form}>
        <Text style={styles.title}>Chargify</Text>

        <Text style={styles.label}>Destination</Text>
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
          onChangeText={setBatteryRange}
          keyboardType="numeric"
        />

        <Pressable
          onPress={onPlan}
          style={[
            styles.button,
            (!start || !end || !batteryRange) && styles.buttonDisabled,
          ]}
          disabled={!start || !end || !batteryRange}
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
