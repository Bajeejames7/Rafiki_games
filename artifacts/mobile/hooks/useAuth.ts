import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "@rafiki_token";
const TEACHER_KEY = "@rafiki_teacher";

// Hardcoded API base URL for production builds
// Falls back to localhost for local development
const API_BASE = __DEV__
  ? (process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
      : "http://localhost:3000/api")
  : "https://rafiki-games.onrender.com/api";

export interface Teacher {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  block: string;
  role: "admin" | "teacher";
  mustChangePassword: boolean;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        const storedTeacher = await AsyncStorage.getItem(TEACHER_KEY);
        if (storedToken && storedTeacher) {
          // Trust stored session - don't verify on startup
          // This prevents waking the server twice (once on startup, once on login)
          try {
            setToken(storedToken);
            setTeacher(JSON.parse(storedTeacher));
          } catch (err) {
            // Invalid stored data - clear it
            console.warn("Invalid stored session:", err);
            await AsyncStorage.multiRemove([TOKEN_KEY, TEACHER_KEY]);
          }
        }
      } catch (err) {
        console.error("Session restore error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      console.log('[Login] Starting login request...');
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(70000), // 70s — Render free tier can take 50s+ to wake
      });
      console.log('[Login] Response received:', res.status);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Login failed" }));
        return err.error ?? "Login failed";
      }
      const { token: t, teacher: tch } = await res.json();
      setToken(t);
      setTeacher(tch);
      await AsyncStorage.setItem(TOKEN_KEY, t);
      await AsyncStorage.setItem(TEACHER_KEY, JSON.stringify(tch));
      console.log('[Login] Success!');
      return null; // null = success
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
        return "Server took too long to respond. Try again.";
      }
      if (err.message?.includes("Network") || err.message?.includes("fetch")) {
        return "Network error. Check your connection.";
      }
      return "Unable to connect. Check your internet.";
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setToken(null);
    setTeacher(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, TEACHER_KEY]);
  }, [token]);

  const changePassword = useCallback(async (newPassword: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed" }));
      return err.error ?? "Failed";
    }
    // Update local teacher state
    setTeacher((prev) => prev ? { ...prev, mustChangePassword: false } : prev);
    const stored = await AsyncStorage.getItem(TEACHER_KEY);
    if (stored) {
      const t = JSON.parse(stored);
      await AsyncStorage.setItem(TEACHER_KEY, JSON.stringify({ ...t, mustChangePassword: false }));
    }
    return null;
  }, [token]);

  return { token, teacher, loading, login, logout, changePassword };
}
