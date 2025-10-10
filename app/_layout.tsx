import { Stack } from "expo-router";
import { useDarkMode } from "./useDarkMode";

export default function RootLayout() {
  const darkMode = useDarkMode();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "⚡ Chargify",
          headerStyle: { backgroundColor: darkMode ? "#18181b" : "#fff" },
          headerTintColor: darkMode ? "#d1d5db" : "#18181b",
        }}
      />
    </Stack>
  );
}
