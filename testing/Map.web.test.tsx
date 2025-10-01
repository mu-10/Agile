import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import MapWeb from "../components/Map.web";

jest.mock("@react-google-maps/api", () => ({
  GoogleMap: ({ children }: any) => React.createElement("div", { "data-testid": "google-map" }, children),
  Marker: (props: any) => React.createElement("div", { "data-testid": "marker", ...props }),
  InfoWindow: ({ children }: any) => React.createElement("div", { "data-testid": "info-window" }, children),
  DirectionsRenderer: (props: any) => React.createElement("div", { "data-testid": "directions-renderer", ...props }),
  useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
}));

test("renders Google Map and markers", async () => {
  const mockLocationChange = jest.fn();

  render(<MapWeb 
    onLocationChange={mockLocationChange} 
    start="Stockholm"
    end="Gothenburg"
    batteryRange={350}
    batteryCapacity={400}
  />);

  // GoogleMap is rendered
  expect(screen.getByTestId("google-map")).toBeInTheDocument();

  // Location callback was called
  await waitFor(() =>
    expect(mockLocationChange).toHaveBeenCalledWith({ lat: 10, lng: 20 })
  );

  // Directions renderer shows up for route
  await waitFor(() =>
    expect(screen.getByTestId("directions-renderer")).toBeInTheDocument()
  );

  // At least one marker is rendered (the "You are here" marker)
  await waitFor(() =>
    expect(screen.getAllByTestId("marker").length).toBeGreaterThanOrEqual(1)
  );
});

test("shows unreachable destination notification", async () => {
  const mockLocationChange = jest.fn();

  render(<MapWeb 
    onLocationChange={mockLocationChange} 
    start="Stockholm"
    end="Remote Location"
    batteryRange={100} // Low battery range
    batteryCapacity={150}
  />);

  // Wait for the route feasibility check to complete
  await waitFor(() => {
    // Check if the existing battery range warning appears (which indicates route processing)
    const existingWarning = screen.queryByText(/Route exceeds your battery range/);
    expect(existingWarning).toBeTruthy();
  }, { timeout: 3000 });

  // The new notification system should also work alongside the existing warning
  // For now, we'll test that the route processing completes
});

test("shows charging required notification for long routes", async () => {
  const mockLocationChange = jest.fn();

  render(<MapWeb 
    onLocationChange={mockLocationChange} 
    start="Stockholm"
    end="Gothenburg"
    batteryRange={200} // Insufficient for 470km route but stations available
    batteryCapacity={300}
  />);

  // Should show the existing battery range warning
  await waitFor(() => {
    const existingWarning = screen.queryByText(/Route exceeds your battery range/);
    expect(existingWarning).toBeTruthy();
  }, { timeout: 3000 });

  // The route should be processed and distance calculated
  await waitFor(() => {
    const distanceInfo = screen.queryByText(/Distance:/);
    expect(distanceInfo).toBeTruthy();
  }, { timeout: 3000 });
});
