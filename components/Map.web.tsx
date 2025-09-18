import React, { useEffect, useRef } from "react";

declare global {
  interface Window { initChargifyMap?: () => void; }
}

interface MapWebProps {
  lat?: number;
  lng?: number;
  zoom?: number;
}

export default function MapWeb({ lat = 57.7089, lng = 11.9746, zoom = 13 }: MapWebProps) {
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const key =
      process.env.EXPO_PUBLIC_MAPS_WEB_KEY ||
      (globalThis as any).expo?.router?.__ctx?.manifest?.extra?.mapsWebKey;

    if (!key) {
      console.warn("Google Maps web key missing (EXPO_PUBLIC_MAPS_WEB_KEY).");
      return;
    }

    if (!divRef.current) return;

    function renderMap() {
      if (!divRef.current || !(window as any).google?.maps) return;
      const center = { lat, lng };
      const map = new (window as any).google.maps.Map(divRef.current, {
        center,
        zoom,
        mapTypeControl: false,
        streetViewControl: false
      });
      new (window as any).google.maps.Marker({ position: center, map, title: "Gothenburg" });
    }

    // Reuse existing script
    const existing = document.querySelector<HTMLScriptElement>("script[data-chargify-map]");
    if (existing) {
      if ((window as any).google?.maps) renderMap();
      return;
    }

    window.initChargifyMap = renderMap;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initChargifyMap`;
    s.async = true;
    s.defer = true;
    s.dataset.chargifyMap = "1";
    document.head.appendChild(s);

    return () => {
      // Optional: keep script cached; if you want cleanup, uncomment below
      // s.remove();
      delete window.initChargifyMap;
    };
  }, [lat, lng, zoom]);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
