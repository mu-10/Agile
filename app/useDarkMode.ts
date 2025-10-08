import { useEffect, useState } from "react";

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const hour = new Date().getHours();
    setDarkMode(hour >= 19 || hour < 7);
  }, []);
  return darkMode;
}