require('dotenv').config();

module.exports = ({ config }) => ({
  expo: {
    name: "Chargify",
    slug: "Chargify",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "chargify",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.yourcompany.chargify",
      config: {
        googleMapsApiKey: process.env.MAPS_IOS_KEY
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.yourcompany.chargify",
      config: {
        googleMaps: {
          apiKey: process.env.MAPS_ANDROID_KEY
        }
      }
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: { backgroundColor: "#000000" }
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      mapsWebKey: process.env.EXPO_PUBLIC_MAPS_WEB_KEY
    }
  }
});