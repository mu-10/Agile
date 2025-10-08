import { useEffect, useState } from "react";

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const hour = new Date().getHours();

    //To change times or test if the dark mode is working, you can comment the code snippet below and set the hour variable to any number between 0-23
    setDarkMode(hour >= 19 || hour < 7);
  }, []);
  return darkMode;
}