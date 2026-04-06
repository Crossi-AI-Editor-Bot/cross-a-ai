import { useState, useEffect, useCallback } from "react";

const DEV_MODE_KEY = "dev_mode_enabled";

export const useDevMode = () => {
  const [devMode, setDevMode] = useState(() => localStorage.getItem(DEV_MODE_KEY) === "true");

  useEffect(() => {
    const handler = () => {
      setDevMode(localStorage.getItem(DEV_MODE_KEY) === "true");
    };
    window.addEventListener("dev-mode-changed", handler);
    return () => window.removeEventListener("dev-mode-changed", handler);
  }, []);

  const toggleDevMode = useCallback((enabled: boolean) => {
    localStorage.setItem(DEV_MODE_KEY, String(enabled));
    setDevMode(enabled);
    window.dispatchEvent(new Event("dev-mode-changed"));
  }, []);

  return { devMode, toggleDevMode };
};

export const isDevModeEnabled = () => localStorage.getItem(DEV_MODE_KEY) === "true";
