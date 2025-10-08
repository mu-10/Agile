import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapWeb from "../components/Map.web";
import vehiclesData from "../data/vehicles.json";
import { useDarkMode } from "./useDarkMode";

export default function Index() {
  // Input states
  const [startInput, setStartInput] = useState<string>("");
  const [startCoords, setStartCoords] = useState<string | null>(null);
  const [end, setEnd] = useState<string>("");
  const [batteryRange, setBatteryRange] = useState<string>("");
  const [batteryCapacity, setBatteryCapacity] = useState<string>("");
  const [rangeError, setRangeError] = useState<string>("");
  const [capacityError, setCapacityError] = useState<string>("");

  // Vehicle selection states
  const [vehicleSearch, setVehicleSearch] = useState<string>("");
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [vehiclePredictions, setVehiclePredictions] = useState<any[]>([]);
  const [showVehiclePreds, setShowVehiclePreds] = useState<boolean>(false);

  const darkMode = useDarkMode();

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
      setRangeError("Current range cannot exceed max range");
    } else {
      setBatteryRange(numericValue);
      setRangeError(numericValue === "" ? "Current range must be a number" : "");
    }
  };

  // Handle numeric input for capacity
  const handleCapacityChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, "");
    setBatteryCapacity(numericValue);
    if (numericValue === "") {
      setCapacityError("Max range must be a number");
    } else if (Number(numericValue) > 1000) {
      setCapacityError("Please enter a valid max range.");
    } else {
      setCapacityError("");
    }
  };

  // Plan button
  const onPlan = () => {
    let valid = true;
    if (!batteryRange || isNaN(Number(batteryRange))) {
      setRangeError("Please enter a valid number for current range");
      valid = false;
    } else {
      setRangeError("");
    }
    if (!batteryCapacity || isNaN(Number(batteryCapacity)) || Number(batteryCapacity) > 1000) {
      setCapacityError(!batteryCapacity || isNaN(Number(batteryCapacity)) ? "Please enter a valid number for max range" : "Please enter a valid max range.");
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
  };

  // Fill input with current location on button press
  const useCurrentLocation = async () => {
    if (!currentLocation) return;
    const loc = currentLocation;
    setStartCoords(`${loc.lat},${loc.lng}`);
    
    // Hide autocomplete dropdown when using current location
    setShowStartPreds(false);
    setStartPredictions([]);

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.lat},${loc.lng}&key=${process.env.EXPO_PUBLIC_MAPS_WEB_KEY}`
      );
      const json = await res.json();
      if (json.results && json.results.length > 0) {
        // Always set the actual address from reverse geocoding
        setStartInput(json.results[0].formatted_address);
      } else {
        // Try to get a simpler address format if the first one fails
        const simpleAddress = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
        setStartInput(simpleAddress);
      }
    } catch (err) {
      console.error("Reverse geocoding failed:", err);
      // Use a more readable format for coordinates as fallback
      const simpleAddress = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
        setStartInput(simpleAddress);
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

  // Vehicle search functionality
  const searchVehicles = (searchText: string) => {
    if (!searchText || searchText.length < 2) {
      setVehiclePredictions([]);
      return;
    }
    
    const filtered = vehiclesData.filter((vehicle: any) => {
      const fullName = `${vehicle.brand} ${vehicle.model}`;
      return fullName.toLowerCase().includes(searchText.toLowerCase());
    }).slice(0, 10); // Limit to 10 results
    
    setVehiclePredictions(filtered);
  };

  const handleVehicleSearchChange = (text: string) => {
    setVehicleSearch(text);
    setShowVehiclePreds(true);
    searchVehicles(text);
    
    // If text is cleared, also clear the selected vehicle
    if (!text) {
      setSelectedVehicle(null);
    }
  };

  const selectVehicle = (vehicle: any) => {
    const vehicleName = `${vehicle.brand} ${vehicle.model}`;
    setVehicleSearch(vehicleName);
    setSelectedVehicle(vehicle);
    setShowVehiclePreds(false);
    setVehiclePredictions([]);
    
    // Auto-fill the max range from vehicle data
    setBatteryCapacity(vehicle.range_km.toString());
    setCapacityError(""); // Clear any existing capacity error
  };

  // Google Maps dark style array
  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#212121" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#181818" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#383838" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212121" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
  ];

  return (
    <View style={{ flex: 1, backgroundColor: darkMode ? "#18181b" : "#f3f4f6" }}>
      <View style={[
        styles.toolbar,
        darkMode && { backgroundColor: "#27272a" }
      ]}>
        <Ionicons
          name="navigate-outline"
          size={18}
          color={darkMode ? "#d1d5db" : "#9ca3af"}
          style={styles.icon}
        />
        {/* From input with location button */}
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <TextInput
            style={[
              styles.input,
              { flex: 1 },
              darkMode && { backgroundColor: "#27272a", color: "#d1d5db" },
            ]}
            placeholder="From"
            placeholderTextColor={darkMode ? "#6b7280" : "#9ca3af"}
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
          style={[
            styles.input,
            darkMode && { backgroundColor: "#27272a", color: "#d1d5db" },
          ]}
          placeholder="To"
          placeholderTextColor={darkMode ? "#6b7280" : "#9ca3af"}
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

        {/* Current battery range */}
        <TextInput
          style={[
            styles.input,
            darkMode && { backgroundColor: "#27272a", color: "#d1d5db" },
          ]}
          placeholder="Current range (km left)"
          placeholderTextColor={darkMode ? "#6b7280" : "#9ca3af"}
          value={batteryRange}
          keyboardType="numeric"
          onChangeText={handleRangeChange}
        />

        <View style={styles.divider} />

        {/* Vehicle selector */}
        <TextInput
          style={[styles.input, darkMode && { backgroundColor: "#27272a", color: "#d1d5db" }]} // <-- fix for dark mode text
          placeholder="Select vehicle model (optional)"
          placeholderTextColor={darkMode ? "#6b7280" : "#9ca3af"}
          value={vehicleSearch}
          onChangeText={handleVehicleSearchChange}
          onFocus={() => setShowVehiclePreds(true)}
          onBlur={() => {
            // Delay hiding to allow for selection
            setTimeout(() => setShowVehiclePreds(false), 150);
          }}
        />

        <View style={styles.divider} />

        {/* Max range */}
        <TextInput
          style={[
            styles.input,
            darkMode && { backgroundColor: "#27272a", color: "#d1d5db" },
          ]}
          placeholder="Max range (km when full)"
          placeholderTextColor={darkMode ? "#6b7280" : "#9ca3af"}
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
        <View style={[styles.suggestionsContainer, darkMode && { backgroundColor: "#18181b" }]}> 
          {showStartPreds && startInput.length > 0 && (
            <View style={[styles.suggestionsList, darkMode && { backgroundColor: "#27272a", borderColor: "#444" }]}> 
              {startInput.length > 0 ? (
                startPredictions.length > 0 ? (
                  startPredictions.slice(0, 8).map((p) => (
                    <Pressable
                      key={p.place_id}
                      onPress={() => pickPrediction(p, "start")}
                      style={[styles.suggestionItem, darkMode && { backgroundColor: "#27272a" }]}
                    >
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={darkMode ? "#d1d5db" : "#6b7280"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.suggestionText, darkMode && { color: "#d1d5db" }]}>{p.description}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ padding: 10, color: darkMode ? "#888" : "#888" }}>No address found</Text>
                )
              ) : null}
            </View>
          )}
          {showEndPreds && end.length > 0 && (
            <View style={[styles.suggestionsList, darkMode && { backgroundColor: "#27272a", borderColor: "#444" }]}> 
              {end.length > 0 ? (
                endPredictions.length > 0 ? (
                  endPredictions.slice(0, 8).map((p) => (
                    <Pressable
                      key={p.place_id}
                      onPress={() => pickPrediction(p, "end")}
                      style={[styles.suggestionItem, darkMode && { backgroundColor: "#27272a" }]}
                    >
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={darkMode ? "#d1d5db" : "#6b7280"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.suggestionText, darkMode && { color: "#d1d5db" }]}>{p.description}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ padding: 10, color: darkMode ? "#888" : "#888" }}>No address found</Text>
                )
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {/* Vehicle predictions dropdown */}
      {showVehiclePreds && vehiclePredictions.length > 0 && (
        <View style={[styles.vehicleDropdownContainer, darkMode && { backgroundColor: "#18181b" }]}> 
          <ScrollView style={[styles.vehicleDropdown, darkMode && { backgroundColor: "#27272a", borderColor: "#444" }]} showsVerticalScrollIndicator={false}>
            {vehiclePredictions.map((vehicle: any, index: number) => (
              <Pressable
                key={index}
                style={[styles.vehiclePredictionItem, darkMode && { backgroundColor: "#27272a" }]}
                onPress={() => selectVehicle(vehicle)}
              >
                <Text style={[styles.predictionText, darkMode && { color: "#d1d5db" }]}>
                  {vehicle.brand} {vehicle.model}
                </Text>
                <Text style={[styles.predictionSubtext, darkMode && { color: "#a1a1aa" }]}>
                  {vehicle.range_km} km max range • {vehicle.battery_capacity_kWh} kWh
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

  {/* Always show a solid grey divider between input fields and map */}
  <View style={{ width: "100%", backgroundColor: darkMode ? "#27272a" : "#f3f4f6", height: 8 }} />
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
          showRecommendedLocations={!!(plannedStart && plannedEnd)} // only show when a route is planned
          mapStyle={darkMode ? darkMapStyle : undefined}
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
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
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
    boxShadow: "0 6px 10px rgba(34, 197, 94, 0.25)",
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
    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.08)",
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
  inputContainer: {
    position: "relative",
    flex: 1,
    zIndex: 10000,
  },
  predictionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 8,
    marginTop: 2,
    maxHeight: 200,
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
    elevation: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    zIndex: 10001,
  },
  predictionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  predictionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  predictionSubtext: {
    fontSize: 12,
    color: "#6b7280",
  },
  vehicleDropdownContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 70, // Position below the toolbar
    zIndex: 99999,
  },
  vehicleDropdown: {
    backgroundColor: "#fff",
    borderRadius: 12,
    maxHeight: 200,
    boxShadow: "0 6px 12px rgba(0, 0, 0, 0.15)",
    elevation: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  vehiclePredictionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
});
