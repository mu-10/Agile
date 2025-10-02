import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapWeb from "../components/Map.web";

export default function Index() {
  // Input states
  const [startInput, setStartInput] = useState<string>("");
  const [startCoords, setStartCoords] = useState<string | null>(null);
  const [end, setEnd] = useState<string>("");
  const [batteryRange, setBatteryRange] = useState<string>("");
  const [batteryCapacity, setBatteryCapacity] = useState<string>("");
  const [rangeError, setRangeError] = useState<string>("");
  const [capacityError, setCapacityError] = useState<string>("");

  // Places Autocomplete predictions
  const [startPredictions, setStartPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [endPredictions, setEndPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [showStartPreds, setShowStartPreds] = useState<boolean>(false);
  const [showEndPreds, setShowEndPreds] = useState<boolean>(false);
  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(
    null
  );
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected precise places
  const [originPlaceId, setOriginPlaceId] = useState<string | null>(null);
  const [destinationPlaceId, setDestinationPlaceId] = useState<string | null>(
    null
  );

  // Track GPS location from MapWeb
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Store the route only when Plan is pressed
  const [plannedStart, setPlannedStart] = useState<string | null>(null);
  const [plannedEnd, setPlannedEnd] = useState<string | null>(null);
  const [plannedOriginPlaceId, setPlannedOriginPlaceId] = useState<
    string | null
  >(null);
  const [plannedDestinationPlaceId, setPlannedDestinationPlaceId] = useState<
    string | null
  >(null);
  const [plannedRange, setPlannedRange] = useState<number>(0);

  // Flag set when MapWeb finished loading Maps JS (avoids double loader error)
  const [isMapsReady, setIsMapsReady] = useState(false);

  // Handle numeric input
  const handleRangeChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, "");
    if (batteryCapacity && Number(numericValue) > Number(batteryCapacity)) {
      setBatteryRange(batteryCapacity);
      setRangeError("Range cannot exceed capacity");
    } else {
      setBatteryRange(numericValue);
      setRangeError(numericValue === "" ? "Range must be a number" : "");
    }
  };

  // Handle numeric input for capacity
  const handleCapacityChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, "");
    setBatteryCapacity(numericValue);
    if (numericValue === "") {
      setCapacityError("Capacity must be a number");
    } else if (Number(numericValue) > 1000) {
      setCapacityError("Please enter a valid capacity.");
    } else {
      setCapacityError("");
    }
  };

  // Plan button
  const onPlan = () => {
    let valid = true;
    if (!batteryRange || isNaN(Number(batteryRange))) {
      setRangeError("Please enter a valid number for battery range");
      valid = false;
    } else {
      setRangeError("");
    }
    if (!batteryCapacity || isNaN(Number(batteryCapacity)) || Number(batteryCapacity) > 1000) {
      setCapacityError(!batteryCapacity || isNaN(Number(batteryCapacity)) ? "Please enter a valid number for capacity" : "Please enter a valid capacity.");
      valid = false;
    } else {
      setCapacityError("");
    }
    if (!valid) return;

    // Lock in the planned values
    setPlannedStart(startCoords || startInput);
    setPlannedEnd(end);
    setPlannedOriginPlaceId(originPlaceId);
    setPlannedDestinationPlaceId(destinationPlaceId);
    setPlannedRange(Number(batteryRange));

    console.log("Planned route:", {
      start: startCoords || startInput,
      end,
      batteryRange,
      batteryCapacity,
    });
  };

  // Fill input with current location on button press
  const useCurrentLocation = async () => {
    if (!currentLocation) return;
    const loc = currentLocation;
    setStartCoords(`${loc.lat},${loc.lng}`);

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.lat},${loc.lng}&key=${process.env.EXPO_PUBLIC_MAPS_WEB_KEY}`
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

  // Initialize AutocompleteService when maps is ready (web only)
  useEffect(() => {
    if (!isMapsReady || Platform.OS !== "web") return;
    if (!acServiceRef.current) {
      // @ts-ignore - global google injected by loader
      acServiceRef.current = new google.maps.places.AutocompleteService();
    }
  }, [isMapsReady]);

  // Debounced prediction fetcher
  const requestPredictions = (text: string, which: "start" | "end") => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (!acServiceRef.current || !text || text.length < 2) {
        which === "start" ? setStartPredictions([]) : setEndPredictions([]);
        return;
      }
      const opts: google.maps.places.AutocompletionRequest = {
        input: text,
        // Optional: bias to current location if we have it
        ...(currentLocation && {
          location: new google.maps.LatLng(
            currentLocation.lat,
            currentLocation.lng
          ),
          radius: 30000, // 30km
        }),
      } as any;
      acServiceRef.current.getPlacePredictions(opts, (preds, status) => {
        if (status === "OK" && preds) {
          which === "start"
            ? setStartPredictions(preds)
            : setEndPredictions(preds);
        } else {
          which === "start" ? setStartPredictions([]) : setEndPredictions([]);
        }
      });
    }, 180);
  };

  const pickPrediction = (
    pred: google.maps.places.AutocompletePrediction,
    which: "start" | "end"
  ) => {
    if (which === "start") {
      setStartInput(pred.description);
      setStartCoords(null);
      setOriginPlaceId(pred.place_id);
      setShowStartPreds(false);
      setStartPredictions([]);
    } else {
      setEnd(pred.description);
      setDestinationPlaceId(pred.place_id);
      setShowEndPreds(false);
      setEndPredictions([]);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Ionicons
          name="navigate-outline"
          size={18}
          color="#9ca3af"
          style={styles.icon}
        />

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
              setOriginPlaceId(null);
              if (Platform.OS === "web") {
                setShowStartPreds(true);
                requestPredictions(val, "start");
              }
            }}
            onFocus={() => {
              if (Platform.OS === "web") {
                setShowStartPreds(true);
                requestPredictions(startInput, "start");
              }
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
          {/* Removed obsolete autocomplete predictions dropdown. Only use the new conditional dropdown below. */}

        <View style={styles.divider} />

        {/* To input */}
        <TextInput
          style={styles.input}
          placeholder="To"
          placeholderTextColor="#9ca3af"
          value={end}
          onChangeText={(val) => {
            setEnd(val);
            setDestinationPlaceId(null);
            if (Platform.OS === "web") {
              setShowEndPreds(true);
              requestPredictions(val, "end");
            }
          }}
          onFocus={() => {
            if (Platform.OS === "web") {
              setShowEndPreds(true);
              requestPredictions(end, "end");
            }
          }}
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

        <View style={styles.divider} />

        {/* Battery capacity */}
        <TextInput
          style={styles.input}
          placeholder="Capacity km"
          placeholderTextColor="#9ca3af"
          value={batteryCapacity}
          keyboardType="numeric"
          onChangeText={handleCapacityChange}
        />

        {/* Plan button */}
        <Pressable
          onPress={onPlan}
          disabled={!startInput || !end || !batteryRange || !batteryCapacity || !!rangeError || !!capacityError}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (!startInput || !end || !batteryRange || !batteryCapacity || !!rangeError || !!capacityError) &&
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
      {capacityError ? <Text style={styles.error}>{capacityError}</Text> : null}

      {/* Suggestions dropdowns (web only) - only render if showing predictions */}
      {Platform.OS === "web" && ((showStartPreds && startInput.length > 0) || (showEndPreds && end.length > 0)) ? (
        <View style={styles.suggestionsContainer}>
          {showStartPreds && startInput.length > 0 && (
            <View style={styles.suggestionsList}>
              {startInput.length > 0 ? (
                startPredictions.length > 0 ? (
                  startPredictions.slice(0, 8).map((p) => (
                    <Pressable
                      key={p.place_id}
                      onPress={() => pickPrediction(p, "start")}
                      style={styles.suggestionItem}
                    >
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color="#6b7280"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.suggestionText}>{p.description}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ padding: 10, color: "#888" }}>No address found</Text>
                )
              ) : null}
            </View>
          )}
          {showEndPreds && end.length > 0 && (
            <View style={styles.suggestionsList}>
              {end.length > 0 ? (
                endPredictions.length > 0 ? (
                  endPredictions.slice(0, 8).map((p) => (
                    <Pressable
                      key={p.place_id}
                      onPress={() => pickPrediction(p, "end")}
                      style={styles.suggestionItem}
                    >
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color="#6b7280"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.suggestionText}>{p.description}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ padding: 10, color: "#888" }}>No address found</Text>
                )
              ) : null}
            </View>
          )}
        </View>
      ) : null}

  {/* Always show a solid grey divider between input fields and map */}
  <View style={{ width: "100%", backgroundColor: "#f3f4f6", height: 8 }} />
      <View style={{ flex: 1 }}>
        <MapWeb
          start={plannedStart || ""} // only sends planned values
          end={plannedEnd || ""}
          originPlaceId={plannedOriginPlaceId || undefined}
          destinationPlaceId={plannedDestinationPlaceId || undefined}
          batteryRange={plannedRange}
          batteryCapacity={Number(batteryCapacity) || 0}
          onLocationChange={(loc) => setCurrentLocation(loc)}
          onMapsReady={() => setIsMapsReady(true)}
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
  suggestionsContainer: {
    position: "absolute",
    zIndex: 9999,
    left: 12,
    right: 12,
    top: 70, // just under the toolbar
  },
  suggestionsList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  suggestionText: {
    fontSize: 14,
    color: "#111827",
  },
});
