import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "@rafiki_token";
const TEACHER_KEY = "@rafiki_teacher";

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
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
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const storedTeacher = await AsyncStorage.getItem(TEACHER_KEY);
      if (storedToken && storedTeacher) {
        try {
          // Verify token is still valid
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
            signal: AbortSignal.timeout(60000),
          });
          if (res.ok) {
            const t = await res.json();
            setToken(storedToken);
            setTeacher(t);
          } else {
            // Token invalid or expired — clear and force re-login
            await AsyncStorage.multiRemove([TOKEN_KEY, TEACHER_KEY]);
          }
        } catch (err) {
          // Server unreachable or timeout — clear token and force fresh login
          // This prevents infinite loading when token is stale
          console.warn("Token verification failed:", err);
          await AsyncStorage.multiRemove([TOKEN_KEY, TEACHER_KEY]);
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(60000), // 60s — Render free tier can take 50s to wake
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      return err.error ?? "Login failed";
    }
    const { token: t, teacher: tch } = await res.json();
    setToken(t);
    setTeacher(tch);
    await AsyncStorage.setItem(TOKEN_KEY, t);
    await AsyncStorage.setItem(TEACHER_KEY, JSON.stringify(tch));
    return null; // null = success
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
