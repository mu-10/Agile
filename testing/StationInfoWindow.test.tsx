import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StationInfoWindow from '../components/StationInfoWindow';

// Mock Google Maps InfoWindow
jest.mock('@react-google-maps/api', () => ({
  InfoWindow: ({ children, onCloseClick }: any) => (
    <div data-testid="info-window" onClick={onCloseClick}>
      {children}
    </div>
  ),
}));

// Mock Google Maps Size constructor
Object.defineProperty(window, 'google', {
  value: {
    maps: {
      Size: jest.fn((width, height) => ({ width, height })),
    },
  },
});

describe('StationInfoWindow', () => {
  const mockStation = {
    id: '1',
    title: 'Test Charging Station',
    address: '123 Test St',
    town: 'Test City',
    state: 'Test State',
    operator: 'Test Operator',
    statusType: 'Operational',
    numberOfPoints: 4,
    latitude: 57.7089,
    longitude: 11.9746,
    usageCost: '2.50 SEK/kWh',
    connections: [
      {
        type: 'CCS',
        powerKW: 150,
        level: 'DC Fast',
        quantity: 2
      },
      {
        type: 'CHAdeMO',
        powerKW: 50,
        level: 'DC Fast',
        quantity: 1
      }
    ]
  };

  const mockRecommendedStation = {
    ...mockStation,
    batteryPercentAtArrival: 25,
    maxPowerKW: 150,
    estimatedChargingTimeMinutes: 45,
    distanceFromStart: 180,
    actualDetour: 2.5,
    remainingRangeAtDestination: 95,
    routeKm: 185.5,
    routeDeviationKm: 1.2
  };

  const defaultProps = {
    station: mockStation,
    isVisible: true,
    onClose: jest.fn(),
    isRecommended: false,
    isDarkMode: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders station information correctly', () => {
    render(<StationInfoWindow {...defaultProps} />);
    
    expect(screen.getByText('Test Charging Station')).toBeInTheDocument();
    expect(screen.getByText('123 Test St')).toBeInTheDocument();
    expect(screen.getByText('Test City, Test State')).toBeInTheDocument();
    expect(screen.getByText('Test Operator')).toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('💳 2.50 SEK/kWh')).toBeInTheDocument();
  });

  test('shows recommended badge when isRecommended is true', () => {
    render(<StationInfoWindow {...defaultProps} isRecommended={true} />);
    
    expect(screen.getByText('Recommended Charging Station')).toBeInTheDocument();
  });

  test('shows charging details for recommended stations', () => {
    const { container } = render(
      <StationInfoWindow 
        {...defaultProps} 
        station={mockRecommendedStation}
        isRecommended={true} 
      />
    );
    
    // Check for presence of charging details section
    expect(screen.getByText('⚡ Charging Details')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('+2.5 km')).toBeInTheDocument();
    
    // Check that the container includes the expected values
    expect(container.textContent).toContain('150');
    expect(container.textContent).toContain('kW');
    expect(container.textContent).toContain('45');
    expect(container.textContent).toContain('min');
    expect(container.textContent).toContain('180');
    expect(container.textContent).toContain('95');
  });

  test('shows route information when available', () => {
    const { container } = render(
      <StationInfoWindow 
        {...defaultProps} 
        station={mockRecommendedStation}
      />
    );
    
    expect(screen.getByText('📍 Route Information')).toBeInTheDocument();
    expect(container.textContent).toContain('185.5');
    expect(container.textContent).toContain('km along route');
    expect(container.textContent).toContain('1.2');
    expect(container.textContent).toContain('km from route');
  });

  test('renders connection types correctly', () => {
    const { container } = render(<StationInfoWindow {...defaultProps} />);
    
    expect(screen.getByText('🔌 Connection Types')).toBeInTheDocument();
    expect(screen.getByText('CCS')).toBeInTheDocument();
    expect(screen.getByText('CHAdeMO')).toBeInTheDocument();
    expect(container.textContent).toContain('DC Fast');
    expect(container.textContent).toContain('Qty: 2');
  });

  test('applies dark mode styling when isDarkMode is true', () => {
    const { container } = render(
      <StationInfoWindow {...defaultProps} isDarkMode={true} />
    );
    
    const infoContainer = container.querySelector('[data-testid="info-window"] > div');
    expect(infoContainer).toHaveStyle({
      background: '#18181b',
      color: '#d1d5db'
    });
  });

  test('does not render when isVisible is false', () => {
    render(<StationInfoWindow {...defaultProps} isVisible={false} />);
    
    expect(screen.queryByTestId('info-window')).not.toBeInTheDocument();
  });

  test('does not render when station is null', () => {
    render(<StationInfoWindow {...defaultProps} station={null} />);
    
    expect(screen.queryByTestId('info-window')).not.toBeInTheDocument();
  });

  test('calls onClose when close button is clicked', () => {
    const mockOnClose = jest.fn();
    render(<StationInfoWindow {...defaultProps} onClose={mockOnClose} />);
    
    const infoWindow = screen.getByTestId('info-window');
    infoWindow.click();
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('shows correct battery color based on percentage', () => {
    const lowBatteryStation = { ...mockRecommendedStation, batteryPercentAtArrival: 15 };
    const mediumBatteryStation = { ...mockRecommendedStation, batteryPercentAtArrival: 35 };
    const highBatteryStation = { ...mockRecommendedStation, batteryPercentAtArrival: 65 };

    // Low battery (red)
    const { rerender } = render(
      <StationInfoWindow 
        {...defaultProps} 
        station={lowBatteryStation}
        isRecommended={true} 
      />
    );
    
    let batteryElement = screen.getByText('15%');
    expect(batteryElement).toHaveStyle({ color: '#ef4444' });

    // Medium battery (yellow)
    rerender(
      <StationInfoWindow 
        {...defaultProps} 
        station={mediumBatteryStation}
        isRecommended={true} 
      />
    );
    
    batteryElement = screen.getByText('35%');
    expect(batteryElement).toHaveStyle({ color: '#f59e0b' });

    // High battery (green)
    rerender(
      <StationInfoWindow 
        {...defaultProps} 
        station={highBatteryStation}
        isRecommended={true} 
      />
    );
    
    batteryElement = screen.getByText('65%');
    expect(batteryElement).toHaveStyle({ color: '#10b981' });
  });
});