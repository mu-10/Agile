import React from "react";
import { View, Text } from "react-native";
import Map from "../components/Map"; // <- correct if components/ is at project root

export default function Index() {
  return (
    <View style={{ flex: 1 }}>
      <Map />
      <View
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: "rgba(0,0,0,0.6)",
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#fff" }}>Diddy was here</Text>
      </View>
    </View>
  );
}
