import { render, screen, waitFor } from "@testing-library/react";
import MapWeb from "./Map";

jest.mock("@react-google-maps/api", () => ({
  GoogleMap: ({ children }: any) => <div data-testid="google-map">{children}</div>,
  Marker: (props: any) => <div data-testid="marker" {...props} />,
  InfoWindow: ({ children }: any) => <div data-testid="info-window">{children}</div>,
  useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
}));

test("renders Google Map and markers", async () => {
  const mockLocationChange = jest.fn();

  render(<MapWeb onLocationChange={mockLocationChange} />);

  // GoogleMap is rendered
  expect(screen.getByTestId("google-map")).toBeInTheDocument();

  // Location callback was called
  await waitFor(() =>
    expect(mockLocationChange).toHaveBeenCalledWith({ lat: 10, lng: 20 })
  );

  // Marker from stations API shows up
  await waitFor(() =>
    expect(screen.getAllByTestId("marker").length).toBeGreaterThan(1)
  );
});
