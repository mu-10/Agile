import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

export default function MapNative() {
  const center = {
    latitude: 57.7089,
    longitude: 11.9746,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={center}
    >
      <Marker coordinate={center} title="Gothenburg" />
    </MapView>
  );
}
