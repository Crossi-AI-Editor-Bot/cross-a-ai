import { useState, useEffect } from "react";

const DAILY_CREDITS = 20;
const CREDITS_KEY = "ai_chat_credits";
const LAST_RESET_KEY = "ai_chat_last_reset";

export const useCredits = () => {
  const [credits, setCredits] = useState<number>(DAILY_CREDITS);

  useEffect(() => {
    // Check if we need to reset credits (new day)
    const lastReset = localStorage.getItem(LAST_RESET_KEY);
    const today = new Date().toDateString();

    if (lastReset !== today) {
      // New day, reset credits
      localStorage.setItem(CREDITS_KEY, DAILY_CREDITS.toString());
      localStorage.setItem(LAST_RESET_KEY, today);
      setCredits(DAILY_CREDITS);
    } else {
      // Load existing credits
      const storedCredits = localStorage.getItem(CREDITS_KEY);
      setCredits(storedCredits ? parseFloat(storedCredits) : DAILY_CREDITS);
    }
  }, []);

  const deductCredits = (amount: number): boolean => {
    if (credits < amount) {
      return false; // Not enough credits
    }
    const newCredits = credits - amount;
    setCredits(newCredits);
    localStorage.setItem(CREDITS_KEY, newCredits.toString());
    return true;
  };

  return { credits, deductCredits };
};
