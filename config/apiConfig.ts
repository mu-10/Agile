import { APP_CONFIG, getApiUrls } from './appConfig';

// Legacy API config - now uses central configuration
const API_CONFIG = {
  // Use centralized URLs
  urls: getApiUrls(),
  
  // Keep backward compatibility
  baseUrl: APP_CONFIG.api.baseUrl,
  
  // Additional API-specific settings can go here
  timeout: 10000, // 10 seconds
  retryAttempts: 3,
};

export default API_CONFIG;