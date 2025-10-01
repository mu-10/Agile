import { render, screen, waitFor } from "@testing-library/react";
import MapWeb from "../components/Map.web";

jest.mock("@react-google-maps/api", () => ({
  GoogleMap: ({ children }: any) => <div data-testid="google-map">{children}</div>,
  Marker: (props: any) => <div data-testid="marker" {...props} />,
  InfoWindow: ({ children }: any) => <div data-testid="info-window">{children}</div>,
  DirectionsRenderer: (props: any) => <div data-testid="directions-renderer" {...props} />,
  useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
}));

test("renders Google Map and markers", async () => {
  const mockLocationChange = jest.fn();

  render(<MapWeb 
    onLocationChange={mockLocationChange} 
    start="Stockholm"
    end="Gothenburg"
    batteryRange={350}
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
