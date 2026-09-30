import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/constants/api";

const TOKEN_KEY = "@rafiki_token";
const TEACHER_KEY = "@rafiki_teacher";


console.log('[useAuth] API_BASE configured as:', API_BASE);
console.log('[useAuth] __DEV__ is:', __DEV__);

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
          // Show the stored session at once (the server may be asleep and take
          // 50s to wake), then check it in the background: this picks up a
          // role an admin changed, and signs out an account that was deleted
          // or a token the server no longer accepts.
          try {
            setToken(storedToken);
            setTeacher(JSON.parse(storedTeacher));
            fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${storedToken}` } })
              .then(async (res) => {
                if (res.status === 401) {
                  setToken(null);
                  setTeacher(null);
                  await AsyncStorage.multiRemove([TOKEN_KEY, TEACHER_KEY]);
                } else if (res.ok) {
                  const fresh: Teacher = await res.json();
                  setTeacher(fresh);
                  await AsyncStorage.setItem(TEACHER_KEY, JSON.stringify(fresh));
                }
              })
              .catch(() => {}); // offline: keep the stored session
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
      console.log('[Login] Starting login request to:', API_BASE);
      console.log('[Login] Username:', username);
      
      // Create timeout using AbortController (React Native compatible)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[Login] Timeout after 70s');
        controller.abort();
      }, 70000); // 70s — Render free tier can take 50s+ to wake

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('[Login] Response received:', res.status);
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Login failed" }));
        console.error('[Login] Error response:', err);
        return err.error ?? "Login failed";
      }
      
      const data = await res.json();
      console.log('[Login] Data received:', { hasToken: !!data.token, hasTeacher: !!data.teacher });
      
      const { token: t, teacher: tch } = data;
      setToken(t);
      setTeacher(tch);
      await AsyncStorage.setItem(TOKEN_KEY, t);
      await AsyncStorage.setItem(TEACHER_KEY, JSON.stringify(tch));
      console.log('[Login] Success! Saved to storage');
      return null; // null = success
    } catch (err: any) {
      console.error("Login error:", err.name, err.message);
      if (err.name === "AbortError") {
        return "Server is taking too long. Try again in a minute.";
      }
      if (err.message?.includes("Network request failed")) {
        return "Network error. Check your internet connection.";
      }
      return `Connection failed: ${err.message || 'Unknown error'}`;
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
    try {
      console.log('[ChangePassword] Starting password change...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[ChangePassword] Timeout after 15s');
        controller.abort();
      }, 15000);

      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('[ChangePassword] Response received:', res.status);
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to change password" }));
        console.error('[ChangePassword] Error:', err);
        return err.error ?? "Failed to change password";
      }
      
      // Update local teacher state
      console.log('[ChangePassword] Success! Updating local state...');
      setTeacher((prev) => prev ? { ...prev, mustChangePassword: false } : prev);
      const stored = await AsyncStorage.getItem(TEACHER_KEY);
      if (stored) {
        const t = JSON.parse(stored);
        await AsyncStorage.setItem(TEACHER_KEY, JSON.stringify({ ...t, mustChangePassword: false }));
      }
      console.log('[ChangePassword] Password changed successfully');
      return null;
    } catch (err: any) {
      console.error('[ChangePassword] Error:', err.name, err.message);
      if (err.name === "AbortError") {
        return "Request timed out. Please try again.";
      }
      return `Failed: ${err.message || 'Unknown error'}`;
    }
  }, [token]);

  return { token, teacher, loading, login, logout, changePassword };
}
