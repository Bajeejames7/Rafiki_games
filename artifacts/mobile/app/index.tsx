import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import colors from "@/constants/colors";
import { useAuth } from "@/hooks/useAuth";
import { LoginScreen } from "@/components/LoginScreen";
import { ChangePasswordScreen } from "@/components/ChangePasswordScreen";
import { AdminPanel } from "@/components/AdminPanel";
import { API_BASE } from "@/constants/api";

const schoolLogo = require("@/assets/images/school-logo.png");
const schoolBg = require("@/assets/images/school-bg.jpg");

const TEACHER_KEY = "@virtue_teacher";


// Retry fetch with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2,
  timeout = 15000
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      const isLastAttempt = i === retries;
      const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');
      
      console.log(`[Fetch] Attempt ${i + 1}/${retries + 1} failed:`, error.message);
      
      if (isLastAttempt) {
        throw error;
      }
      
      // Wait before retry: 1s, 2s, 4s...
      const delay = Math.min(1000 * Math.pow(2, i), 4000);
      console.log(`[Fetch] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries reached');
}

async function apiFetchScores(): Promise<{ liveStandings: Scores; todayPoints: Scores } | null> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/scores`, {}, 2, 20000);
    if (!res.ok) {
      console.error(`Failed to fetch scores: ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Error fetching scores:', err);
    return null;
  }
}

function newEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function apiPostEvent(
  token: string,
  teamId: string, teamName: string, amount: number,
): Promise<{ liveStandings: Scores; todayPoints: Scores } | null> {
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/scores/event`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // The retry below can re-send a request the server already handled
        // (it timed out on the way back). The id lets the server count it once.
        body: JSON.stringify({ teamId, teamName, amount, clientEventId: newEventId() }),
      },
      2,
      20000
    );
    if (!res.ok) {
      console.error(`Failed to post event: ${res.status} ${res.statusText}`);
      if (res.status === 401) {
        // Token expired or invalid — trigger logout
        throw new Error("UNAUTHORIZED");
      }
      const errText = await res.text().catch(() => '');
      console.error('Response body:', errText);
      return null;
    }
    return await res.json();
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") throw err;
    console.error('Error posting event:', err);
    return null;
  }
}

async function apiFetchLog(token: string, limit = 50, offset = 0): Promise<LogEntry[]> {
  try {
    const url = `${API_BASE}/log?limit=${limit}&offset=${offset}`;
    const res = await fetchWithRetry(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      1,
      15000
    );
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("UNAUTHORIZED");
      }
      return [];
    }
    const data: any[] = await res.json();
    return data.map((e) => ({
      id: String(e.id),
      teacherName: e.teacherName ?? "",
      teacherClass: e.teacherClass ?? "",
      teamId: e.teamId,
      teamName: e.teamName,
      amount: e.amount,
      timestamp: new Date(e.createdAt).getTime(),
    }));
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") throw err;
    return [];
  }
}

async function apiResetScores(token: string): Promise<{ liveStandings: Scores; todayPoints: Scores } | null> {
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/scores/reset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
      1,
      15000
    );
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("UNAUTHORIZED");
      }
      return null;
    }
    return await res.json();
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") throw err;
    return null;
  }
}

async function apiResetTeam(
  token: string,
  teamId: string,
  teamName: string,
): Promise<{ liveStandings: Scores; todayPoints: Scores } | null> {
  const res = await fetchWithRetry(
    `${API_BASE}/scores/reset-team`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ teamId, teamName }),
    },
    1,
    15000,
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return res.ok ? await res.json() : null;
}

interface WeekSummary {
  today: string;
  totals: Scores;
  days: { date: string; totals: Scores; awards: number; teachers: string[] }[];
}

async function apiFetchWeek(token: string): Promise<WeekSummary | null> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/scores/week`, { headers: { Authorization: `Bearer ${token}` } }, 1, 15000);
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    return res.ok ? await res.json() : null;
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") throw err;
    return null;
  }
}

interface LogEntry {
  id: string;
  teacherName: string;
  teacherClass: string;
  teamId: string;
  teamName: string;
  amount: number;
  timestamp: number;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diffDays === 1) return "Yesterday";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function WeeklyModal({
  visible,
  week,
  onClose,
}: {
  visible: boolean;
  week: WeekSummary | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const weeklyTotals = week?.totals ?? {};
  const days = week?.days ?? [];
  const rankedByWeek = [...TEAMS].sort((a, b) => (weeklyTotals[b.id] ?? 0) - (weeklyTotals[a.id] ?? 0));
  const weeklyGrand = Object.values(weeklyTotals).reduce((a, b) => a + b, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={wkStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[wkStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={wkStyles.sheetHeader}>
            <View>
              <Text style={wkStyles.title}>Weekly Leaderboard</Text>
              <Text style={wkStyles.sub}>
                {week === null ? "Loading…" : `${weeklyGrand} pts awarded this week`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={wkStyles.closeBtn} activeOpacity={0.7}>
              <Feather name="x" size={18} color="#8B949E" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Weekly totals banner */}
            <View style={wkStyles.section}>
              <Text style={wkStyles.sectionLabel}>THIS WEEK — ALL TEAMS</Text>
              {rankedByWeek.map((team, idx) => {
                const tc = colors.teams[team.id];
                const pts = weeklyTotals[team.id] ?? 0;
                const maxPts = weeklyTotals[rankedByWeek[0].id] ?? 1;
                const barWidth = maxPts > 0 ? Math.max((pts / maxPts) * 100, pts > 0 ? 6 : 0) : 0;
                const medal = pts > 0 ? (["🥇", "🥈", "🥉", ""][idx] ?? "") : "";
                return (
                  <View key={team.id} style={wkStyles.teamRow}>
                    <Text style={wkStyles.medal}>{medal}</Text>
                    <View style={wkStyles.teamRowInfo}>
                      <View style={wkStyles.teamRowTop}>
                        <Text style={[wkStyles.teamRowName, { color: tc.text }]}>{team.name}</Text>
                        <Text style={[wkStyles.teamRowPts, { color: tc.primary }]}>{pts} pts</Text>
                      </View>
                      <View style={wkStyles.barTrack}>
                        <View style={[wkStyles.barFill, { width: `${barWidth}%` as any, backgroundColor: tc.primary }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Day-by-day breakdown */}
            {week === null ? (
              <ActivityIndicator style={{ marginTop: 24 }} color="#5B8AF5" />
            ) : days.length === 0 ? (
              <View style={wkStyles.empty}>
                <Text style={wkStyles.emptyIcon}>📅</Text>
                <Text style={wkStyles.emptyText}>No points awarded this week</Text>
              </View>
            ) : (
              days.map((day) => {
                const dayGrand = Object.values(day.totals).reduce((a, b) => a + b, 0);
                const isToday = day.date === week.today;
                return (
                  <View key={day.date} style={wkStyles.section}>
                    <View style={wkStyles.dayHeader}>
                      <Text style={[wkStyles.sectionLabel, isToday && { color: "#5B8AF5" }]}>
                        {dayLabel(day.date, week.today).toUpperCase()}
                      </Text>
                      <Text style={wkStyles.dayTotal}>{dayGrand} pts total</Text>
                    </View>
                    {[...TEAMS]
                      .filter((t) => (day.totals[t.id] ?? 0) > 0)
                      .sort((a, b) => (day.totals[b.id] ?? 0) - (day.totals[a.id] ?? 0))
                      .map((team) => {
                        const tc = colors.teams[team.id];
                        return (
                          <View key={team.id} style={wkStyles.dayTeamRow}>
                            <View style={[wkStyles.dot, { backgroundColor: tc.primary }]} />
                            <Text style={[wkStyles.dayTeamName, { color: tc.text }]}>{team.name}</Text>
                            <Text style={[wkStyles.dayTeamPts, { color: tc.primary }]}>+{day.totals[team.id]}</Text>
                          </View>
                        );
                      })}
                    <Text style={wkStyles.submissionCount}>
                      {day.awards} award{day.awards !== 1 ? "s" : ""} by {day.teachers.join(", ")}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const wkStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#161B22",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "#30363D",
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: "88%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#f0f0f0",
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8B949E",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#21262D",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    backgroundColor: "#21262D",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#8B949E",
    letterSpacing: 1.2,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  medal: { fontSize: 18, width: 26 },
  teamRowInfo: { flex: 1, gap: 5 },
  teamRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teamRowName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  teamRowPts: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  barTrack: {
    height: 5,
    backgroundColor: "#30363D",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 5,
    borderRadius: 3,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayTotal: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#8B949E",
  },
  dayTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dayTeamName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dayTeamPts: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  submissionCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8B949E",
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#8B949E",
  },
});

function HistoryModal({
  visible,
  log,
  onClose,
  onClear,
  onLoadMore,
  hasMore,
  loading,
  canReset,
}: {
  visible: boolean;
  log: LogEntry[];
  onClose: () => void;
  onClear: () => void;
  canReset: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={histStyles.overlay}>
        <Pressable style={histStyles.backdrop} onPress={onClose} />
        <View style={[histStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={histStyles.sheetHeader}>
            <View>
              <Text style={histStyles.sheetTitle}>Points Log</Text>
              <Text style={histStyles.sheetSub}>{log.length} event{log.length !== 1 ? "s" : ""} loaded</Text>
            </View>
            <View style={histStyles.headerBtns}>
              {canReset && (
                <TouchableOpacity onPress={onClear} style={histStyles.clearBtn} activeOpacity={0.7}>
                  <Feather name="rotate-ccw" size={14} color="#ef4444" />
                  <Text style={histStyles.clearBtnText}>Reset standings</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={histStyles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={18} color="#8B949E" />
              </TouchableOpacity>
            </View>
          </View>

          {log.length === 0 ? (
            <View style={histStyles.empty}>
              <Text style={histStyles.emptyIcon}>📋</Text>
              <Text style={histStyles.emptyText}>No events yet</Text>
              <Text style={histStyles.emptySub}>Points you award will appear here</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={histStyles.list}>
              {log.map((entry) => {
                const tc = colors.teams[entry.teamId as keyof typeof colors.teams];
                const sign = entry.amount > 0 ? "+" : "";
                return (
                  <View key={entry.id} style={[histStyles.entry, { borderLeftColor: tc?.primary ?? "#fff" }]}>
                    <View style={histStyles.entryLeft}>
                      <Text style={[histStyles.entryPoints, { color: tc?.primary ?? "#fff" }]}>
                        {sign}{entry.amount} → {entry.teamName}
                      </Text>
                      <View style={histStyles.entryMeta}>
                        <Feather name="user" size={11} color="#8B949E" />
                        <Text style={histStyles.entryMetaText}>
                          {entry.teacherName} · {entry.teacherClass}
                        </Text>
                      </View>
                    </View>
                    <Text style={histStyles.entryTime}>{formatTime(entry.timestamp)}</Text>
                  </View>
                );
              })}
              
              {hasMore && (
                <TouchableOpacity 
                  onPress={onLoadMore} 
                  style={histStyles.loadMoreBtn}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#5B8AF5" />
                  ) : (
                    <>
                      <Feather name="chevron-down" size={16} color="#5B8AF5" />
                      <Text style={histStyles.loadMoreText}>Load More</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const histStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: "#161B22",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "#30363D",
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#f0f0f0",
    letterSpacing: -0.3,
  },
  sheetSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8B949E",
    marginTop: 2,
  },
  headerBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2D1B1B",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#ef4444",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#21262D",
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    flex: 1,
  },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 10,
    marginBottom: 2,
    backgroundColor: "#21262D33",
    borderRadius: 8,
  },
  entryLeft: {
    flex: 1,
    gap: 3,
  },
  entryPoints: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  entryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  entryMetaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8B949E",
  },
  entryTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8B949E",
    marginLeft: 8,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 6,
  },
  emptyIcon: { fontSize: 36 },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#8B949E",
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#8B949E66",
  },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#21262D",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  loadMoreText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#5B8AF5",
  },
});

interface Team {
  id: "wisdom" | "justice" | "fortitude" | "temperance";
  name: string;
  symbol: string;
  iconName: string;
}

const TEAMS: Team[] = [
  { id: "wisdom", name: "Wisdom", symbol: "W", iconName: "book-open" },
  { id: "justice", name: "Justice", symbol: "J", iconName: "shield" },
  { id: "fortitude", name: "Fortitude", symbol: "F", iconName: "zap" },
  { id: "temperance", name: "Temperance", symbol: "T", iconName: "anchor" },
];

type Scores = Record<string, number>;

const RANK_LABELS = ["1st", "2nd", "3rd", "4th"];

function getRankedTeams(scores: Scores): Team[] {
  return [...TEAMS].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
}

function TeacherSetupModal({
  visible,
  initial,
  onSave,
}: {
  visible: boolean;
  initial: { name: string; className: string };
  onSave: (name: string, className: string) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [className, setClassName] = useState(initial.className);

  useEffect(() => {
    setName(initial.name);
    setClassName(initial.className);
  }, [initial.name, initial.className]);

  const canSave = name.trim().length > 0 && className.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={setupStyles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!visible) onSave(name, className); }} />
        <View style={setupStyles.sheet}>
          <Image source={schoolLogo} style={setupStyles.modalLogo} resizeMode="contain" />

          <Text style={setupStyles.title}>Welcome!</Text>
          <Text style={setupStyles.subtitle}>
            Enter your details before awarding points.
          </Text>

          <View style={setupStyles.fields}>
            <View style={setupStyles.field}>
              <Text style={setupStyles.label}>Your Name</Text>
              <View style={setupStyles.inputWrap}>
                <Feather name="user" size={16} color="#8B949E" style={setupStyles.inputIcon} />
                <TextInput
                  style={setupStyles.input}
                  placeholder="e.g. Mrs. Johnson"
                  placeholderTextColor="#8B949E"
                  value={name}
                  onChangeText={setName}
                  returnKeyType="next"
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={setupStyles.field}>
              <Text style={setupStyles.label}>Class / Grade</Text>
              <View style={setupStyles.inputWrap}>
                <Feather name="book" size={16} color="#8B949E" style={setupStyles.inputIcon} />
                <TextInput
                  style={setupStyles.input}
                  placeholder="e.g. Grade 5A"
                  placeholderTextColor="#8B949E"
                  value={className}
                  onChangeText={setClassName}
                  returnKeyType="done"
                  onSubmitEditing={() => canSave && onSave(name.trim(), className.trim())}
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[setupStyles.saveBtn, !canSave && setupStyles.saveBtnDisabled]}
            onPress={() => canSave && onSave(name.trim(), className.trim())}
            activeOpacity={0.8}
            disabled={!canSave}
          >
            <Text style={setupStyles.saveBtnText}>Let's Go →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const setupStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: "#161B22",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#30363D",
    alignItems: "center",
    gap: 8,
  },
  modalLogo: {
    width: 130,
    height: 50,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#f0f0f0",
    letterSpacing: -0.5,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#8B949E",
    textAlign: "center",
    marginBottom: 8,
  },
  fields: {
    width: "100%",
    gap: 14,
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#8B949E",
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#21262D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363D",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  inputIcon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#f0f0f0",
  },
  saveBtn: {
    backgroundColor: "#5B8AF5",
    borderRadius: 14,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
});

function ScoreButton({
  label,
  onPress,
  color,
  small,
}: {
  label: string;
  onPress: () => void;
  color: string;
  small?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={[
          styles.scoreBtn,
          small && styles.scoreBtnSmall,
          { backgroundColor: color + "22", borderColor: color + "55" },
        ]}
      >
        <Text style={[styles.scoreBtnText, small && styles.scoreBtnTextSmall, { color }]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function LeaderBanner({ team, score, isTie }: { team: Team | null; score: number; isTie: boolean }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  if (score === 0) {
    return (
      <View style={leaderStyles.emptyBanner}>
        <Text style={leaderStyles.emptyIcon}>🏆</Text>
        <Text style={leaderStyles.emptyText}>No points awarded yet</Text>
        <Text style={leaderStyles.emptySubtext}>Start scoring to see the leader!</Text>
      </View>
    );
  }

  if (isTie || !team) {
    return (
      <View style={[leaderStyles.banner, { backgroundColor: "#21262D", borderColor: "#30363D" }]}>
        <Text style={leaderStyles.crownEmoji}>🤝</Text>
        <View style={leaderStyles.bannerInfo}>
          <Text style={leaderStyles.tiedLabel}>IT'S A TIE</Text>
          <Text style={leaderStyles.tiedScore}>{score} pts each</Text>
        </View>
      </View>
    );
  }

  const tc = colors.teams[team.id];

  return (
    <Animated.View
      style={[
        leaderStyles.banner,
        {
          backgroundColor: tc.light,
          borderColor: tc.primary,
          transform: [{ scale: pulseAnim }],
          shadowColor: tc.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 12,
          elevation: 8,
        },
      ]}
    >
      <Text style={leaderStyles.crownEmoji}>👑</Text>
      <View style={leaderStyles.bannerInfo}>
        <Text style={[leaderStyles.leadingLabel, { color: tc.primary + "99" }]}>LEADING</Text>
        <Text style={[leaderStyles.teamNameLarge, { color: tc.text }]}>{team.name}</Text>
      </View>
      <View style={leaderStyles.bannerScore}>
        <Text style={[leaderStyles.bannerScoreNum, { color: tc.primary }]}>{score}</Text>
        <Text style={[leaderStyles.bannerScorePts, { color: tc.primary + "77" }]}>pts</Text>
      </View>
    </Animated.View>
  );
}

const leaderStyles = StyleSheet.create({
  banner: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  emptyBanner: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#30363D",
    backgroundColor: "#161B22",
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#8B949E",
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#8B949E66",
  },
  crownEmoji: {
    fontSize: 38,
  },
  bannerInfo: {
    flex: 1,
    gap: 2,
  },
  leadingLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  tiedLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    color: "#8B949E",
  },
  teamNameLarge: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  tiedScore: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#8B949E",
    marginTop: 2,
  },
  bannerScore: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bannerScoreNum: {
    fontSize: 44,
    fontFamily: "Inter_700Bold",
    lineHeight: 48,
    letterSpacing: -2,
  },
  bannerScorePts: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 5,
  },
});

function TeamCard({
  team,
  score,
  rank,
  onAdd,
  onSubtract,
  onReset,
}: {
  team: Team;
  score: number;
  rank: number;
  onAdd: (amount: number) => void;
  onSubtract: (amount: number) => void;
  /** Admins only; without it the card has no long-press action. */
  onReset?: () => void;
}) {
  const tc = colors.teams[team.id];
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const flash = () => {
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.timing(glowAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]).start();
  };

  const handleAdd = (amount: number) => {
    flash();
    onAdd(amount);
  };

  const handleLongPress = onReset
    ? () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onReset();
      }
    : undefined;

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tc.primary + "33", tc.primary],
  });

  const rankMedal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={600}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: tc.light, borderColor },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.teamIdentity}>
            <View style={[styles.iconCircle, { backgroundColor: tc.primary + "33" }]}>
              <Feather name={team.iconName as any} size={20} color={tc.primary} />
            </View>
            <View>
              <Text style={[styles.teamName, { color: tc.text }]}>{team.name}</Text>
              <Text style={styles.rankLabel}>
                {RANK_LABELS[rank]} place
              </Text>
            </View>
          </View>

          <Animated.View style={[styles.scoreDisplay, { transform: [{ scale: scaleAnim }] }]}>
            <Text style={[styles.scoreNumber, { color: tc.primary }]}>
              {score}
            </Text>
            <Text style={[styles.scorePts, { color: tc.primary + "88" }]}>pts</Text>
          </Animated.View>
        </View>

        <View style={styles.cardActions}>
          <View style={styles.addButtons}>
            <ScoreButton label="−1" onPress={() => onSubtract(1)} color={colors.light.destructive} small />
            <ScoreButton label="−50" onPress={() => onSubtract(50)} color={colors.light.destructive} small />
          </View>
          <View style={styles.addButtons}>
            <ScoreButton label="+50" onPress={() => handleAdd(50)} color={tc.primary} small />
            <ScoreButton label="+100" onPress={() => handleAdd(100)} color={tc.primary} small />
            <ScoreButton label="+200" onPress={() => handleAdd(200)} color={tc.primary} small />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function TeacherInputCard({
  name,
  className,
  onSave,
}: {
  name: string;
  className: string;
  onSave: (n: string, c: string) => void;
}) {
  const [draftName, setDraftName] = React.useState(name);
  const [draftClass, setDraftClass] = React.useState(className);
  const saved = name === draftName.trim() && className === draftClass.trim() && name.length > 0;

  React.useEffect(() => { setDraftName(name); }, [name]);
  React.useEffect(() => { setDraftClass(className); }, [className]);

  const handleSave = () => {
    if (draftName.trim()) {
      onSave(draftName.trim(), draftClass.trim());
      Keyboard.dismiss();
    }
  };

  return (
    <View style={ticStyles.card}>
      <View style={ticStyles.cardHeader}>
        <Feather name="user" size={14} color="#8B949E" />
        <Text style={ticStyles.cardTitle}>Who's awarding points?</Text>
        {saved && (
          <View style={ticStyles.savedBadge}>
            <Feather name="check" size={11} color="#42C97A" />
            <Text style={ticStyles.savedText}>Saved</Text>
          </View>
        )}
      </View>
      <View style={ticStyles.row}>
        <View style={ticStyles.inputWrap}>
          <Feather name="user" size={14} color="#8B949E" />
          <TextInput
            style={ticStyles.input}
            placeholder="Teacher name"
            placeholderTextColor="#555"
            value={draftName}
            onChangeText={setDraftName}
            returnKeyType="next"
            onSubmitEditing={handleSave}
          />
        </View>
        <View style={ticStyles.inputWrap}>
          <Feather name="book-open" size={14} color="#8B949E" />
          <TextInput
            style={ticStyles.input}
            placeholder="Class / Grade"
            placeholderTextColor="#555"
            value={draftClass}
            onChangeText={setDraftClass}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>
      </View>
      {!saved && (
        <TouchableOpacity style={ticStyles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
          <Text style={ticStyles.saveBtnText}>Confirm →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const ticStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(22,27,34,0.94)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#30363D",
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#c9d1d9",
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(66,201,122,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  savedText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#42C97A",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#21262D",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#30363D",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#f0f0f0",
  },
  saveBtn: {
    backgroundColor: "#5B8AF5",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
});

function LiveScoresStrip({ scores }: { scores: Scores }) {
  const ranked = [...TEAMS].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const topScore = scores[ranked[0].id] ?? 0;
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  return (
    <View style={lsStyles.card}>
      <View style={lsStyles.cardHeader}>
        <Text style={lsStyles.cardTitle}>🏆 Live Standings</Text>
        <Text style={lsStyles.cardSub}>{total} pts total</Text>
      </View>
      {ranked.map((team, idx) => {
        const tc = colors.teams[team.id];
        const pts = scores[team.id] ?? 0;
        const barPct = topScore > 0 ? Math.max((pts / topScore) * 100, pts > 0 ? 5 : 0) : 0;
        const isLeader = idx === 0 && pts > 0;
        const isTied = idx > 0 && pts === topScore && topScore > 0;
        return (
          <View key={team.id} style={lsStyles.row}>
            <Text style={lsStyles.rank}>
              {pts === 0 ? "—" : ["🥇","🥈","🥉","4"][idx]}
            </Text>
            <View style={lsStyles.rowBody}>
              <View style={lsStyles.rowTop}>
                <Text style={[lsStyles.teamName, { color: tc.text }]}>
                  {team.name}{isTied ? " =" : ""}
                </Text>
                <View style={lsStyles.ptsRow}>
                  {isLeader && <Text style={lsStyles.leadTag}>LEADING</Text>}
                  <Text style={[lsStyles.pts, { color: tc.primary }]}>{pts}</Text>
                </View>
              </View>
              <View style={lsStyles.barTrack}>
                <View
                  style={[
                    lsStyles.barFill,
                    { width: `${barPct}%` as any, backgroundColor: tc.primary },
                    isLeader && { shadowColor: tc.primary, shadowOpacity: 0.6, shadowRadius: 6 },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const lsStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(22,27,34,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#30363D",
    padding: 16,
    marginBottom: 10,
    gap: 11,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#f0f0f0",
    letterSpacing: 0.2,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#8B949E",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rank: {
    fontSize: 18,
    width: 28,
    textAlign: "center",
  },
  rowBody: {
    flex: 1,
    gap: 5,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teamName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  ptsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  leadTag: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#F5C518",
    letterSpacing: 1.2,
    backgroundColor: "rgba(245,197,24,0.15)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pts: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    minWidth: 28,
    textAlign: "right",
  },
  barTrack: {
    height: 6,
    backgroundColor: "#30363D",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
});

function DailyTotalsPanel({ todayPoints }: { todayPoints: Scores }) {
  const todayGrand = Object.values(todayPoints).reduce((a, b) => a + b, 0);

  if (todayGrand === 0) return null;

  const sorted = [...TEAMS].sort((a, b) => (todayPoints[b.id] ?? 0) - (todayPoints[a.id] ?? 0));
  const maxPts = todayPoints[sorted[0].id] ?? 1;

  return (
    <View style={dpStyles.panel}>
      <View style={dpStyles.panelHeader}>
        <Text style={dpStyles.panelTitle}>Today's Points</Text>
        <Text style={dpStyles.panelTotal}>{todayGrand} total</Text>
      </View>
      {sorted.filter((t) => (todayPoints[t.id] ?? 0) > 0).map((team) => {
        const tc = colors.teams[team.id];
        const pts = todayPoints[team.id] ?? 0;
        const barPct = Math.max((pts / maxPts) * 100, 6);
        return (
          <View key={team.id} style={dpStyles.row}>
            <Text style={[dpStyles.teamLabel, { color: tc.text }]}>{team.name}</Text>
            <View style={dpStyles.barWrap}>
              <View style={[dpStyles.bar, { width: `${barPct}%` as any, backgroundColor: tc.primary }]} />
            </View>
            <Text style={[dpStyles.pts, { color: tc.primary }]}>{pts}</Text>
          </View>
        );
      })}
    </View>
  );
}

const dpStyles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(22,27,34,0.92)",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 0,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#30363D",
    gap: 8,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  panelTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#f0f0f0",
    letterSpacing: 0.3,
  },
  panelTotal: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#8B949E",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teamLabel: {
    width: 88,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  barWrap: {
    flex: 1,
    height: 7,
    backgroundColor: "#30363D",
    borderRadius: 4,
    overflow: "hidden",
  },
  bar: {
    height: 7,
    borderRadius: 4,
  },
  pts: {
    width: 30,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
});

const POLL_MS = 5000;
const LOG_PAGE = 50;

/** The newest page from the server on top, then the older entries already loaded. */
function mergeNewestPage(fresh: LogEntry[], loaded: LogEntry[]): LogEntry[] {
  if (loaded.length <= fresh.length) return fresh;
  const oldestFresh = Math.min(...fresh.map((e) => Number(e.id)));
  return [...fresh, ...loaded.filter((e) => Number(e.id) < oldestFresh)];
}

/** Older entries at the bottom, skipping any already on the list. */
function appendOlder(loaded: LogEntry[], older: LogEntry[]): LogEntry[] {
  const seen = new Set(loaded.map((e) => e.id));
  return [...loaded, ...older.filter((e) => !seen.has(e.id))];
}

export default function HomeScreen() {
  const { token, teacher, loading: authLoading, login, recover, logout, changePassword } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);

  const [scores, setScores] = useState<Scores>({
    wisdom: 0, justice: 0, fortitude: 0, temperance: 0,
  });
  const [todayPoints, setTodayPoints] = useState<Scores>({
    wisdom: 0, justice: 0, fortitude: 0, temperance: 0,
  });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [hasMoreLog, setHasMoreLog] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const bg = isDark ? colors.dark.background : "#0D1117";
  const mutedColor = "#8B949E";

  const [week, setWeek] = useState<WeekSummary | null>(null);
  const inFlight = useRef(false);

  const refreshFromServer = useCallback(async () => {
    // One sync at a time: on a slow connection a request can take longer than
    // the poll interval, and stacking them up only makes it slower.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [serverData, serverLog] = await Promise.all([
        apiFetchScores(),
        token ? apiFetchLog(token, LOG_PAGE, 0) : Promise.resolve([]),
      ]);
      if (serverData) {
        setScores(serverData.liveStandings);
        setTodayPoints(serverData.todayPoints);
        setOnline(true);
      } else {
        setOnline(false);
      }
      if (serverLog.length > 0) {
        // Put the newest page on top of what is already loaded, rather than
        // replacing it — otherwise every poll throws away "Load More" pages.
        setLog((prev) => mergeNewestPage(serverLog, prev));
        setHasMoreLog((prev) => prev || serverLog.length >= LOG_PAGE);
      }
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") logout();
    } finally {
      inFlight.current = false;
    }
  }, [token, logout]);

  const loadMoreLog = useCallback(async () => {
    if (!token || loadingMore || !hasMoreLog) return;
    setLoadingMore(true);
    try {
      // The loaded list is contiguous from the newest entry down, so its
      // length is exactly the offset of the next older page.
      const moreLog = await apiFetchLog(token, LOG_PAGE, log.length);
      setLog((prev) => appendOlder(prev, moreLog));
      setHasMoreLog(moreLog.length >= LOG_PAGE);
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") logout();
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMoreLog, log.length, logout]);

  // Poll while the app is on screen; stop when it goes to the background (no
  // point spending a teacher's data and battery on a phone in a pocket), and
  // catch up at once when it comes back.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      refreshFromServer();
      interval = setInterval(refreshFromServer, POLL_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    if (AppState.currentState === "active" || Platform.OS === "web") start();
    const sub = AppState.addEventListener("change", (state) => (state === "active" ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [refreshFromServer]);

  // The weekly board is fetched when it is opened, and kept fresh while open.
  useEffect(() => {
    if (!showWeekly || !token) return;
    let live = true;
    const load = () => apiFetchWeek(token).then((w) => { if (live && w) setWeek(w); }).catch((err) => {
      if (err.message === "UNAUTHORIZED") logout();
    });
    load();
    const interval = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, [showWeekly, token, logout]);

  // Show auth screens before main app
  if (authLoading) return null;
  if (!token || !teacher) return <LoginScreen onLogin={login} onRecover={recover} />;
  if (teacher.mustChangePassword) {
    return (
      <ChangePasswordScreen
        teacherName={`${teacher.firstName} ${teacher.lastName}`}
        onSave={changePassword}
      />
    );
  }
  if (showAdmin && teacher.role === "admin") {
    return <AdminPanel token={token} onClose={() => setShowAdmin(false)} />;
  }

  const refreshLogTop = async () => {
    const fresh = await apiFetchLog(token, LOG_PAGE, 0);
    if (fresh.length > 0) setLog((prev) => mergeNewestPage(fresh, prev));
  };

  // +50/+100/+200, −1 and −50 all go through here.
  const award = async (teamId: string, requested: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const team = TEAMS.find((t) => t.id === teamId);
    const current = scores[teamId] ?? 0;
    if (requested < 0 && current === 0) return;
    // −50 on a house with fewer than 50 points takes it to 0, and the log
    // records what was actually taken off.
    const amount = requested < 0 ? -Math.min(-requested, current) : requested;

    const bump = (delta: number) => (prev: Scores) => ({ ...prev, [teamId]: Math.max(0, (prev[teamId] ?? 0) + delta) });
    // Optimistic update; the server's numbers replace it as soon as they arrive.
    setScores(bump(amount));
    setTodayPoints(bump(amount));
    setSyncing(true);

    try {
      const updated = await apiPostEvent(token, teamId, team?.name ?? teamId, amount);
      if (updated) {
        setScores(updated.liveStandings);
        setTodayPoints(updated.todayPoints);
        await refreshLogTop();
      } else {
        setScores(bump(-amount));
        setTodayPoints(bump(-amount));
        Alert.alert("Sync Failed", "Couldn't save points to the server. Check your internet connection.");
      }
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") {
        logout();
      } else {
        setScores(bump(-amount));
        setTodayPoints(bump(-amount));
        Alert.alert("Connection Error", "Failed to connect to the server. Please try again.");
      }
    } finally {
      setSyncing(false);
    }
  };

  const isAdmin = teacher.role === "admin";

  // Admin only: long-press a house card to put its live standing back to 0.
  const handleResetTeam = (teamId: string, teamName: string) => {
    if (!isAdmin) return;
    Alert.alert(
      `Reset ${teamName}?`,
      "This sets their live standing to 0 on ALL devices. Today's points are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setSyncing(true);
            try {
              const result = await apiResetTeam(token, teamId, teamName);
              if (result) {
                setScores(result.liveStandings);
                setTodayPoints(result.todayPoints);
                await refreshLogTop();
              } else {
                Alert.alert("Reset Failed", "The server did not accept the reset. Try again.");
              }
            } catch (err: any) {
              if (err.message === "UNAUTHORIZED") logout();
              else Alert.alert("Connection Error", "Failed to connect to the server. Please try again.");
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  };

  const handleResetAll = () => {
    if (!isAdmin) {
      Alert.alert("Admin Only", "Only administrators can reset live standings.");
      return;
    }
    
    Alert.alert(
      "Reset Live Standings?",
      "This will reset the LIVE STANDINGS to zero. Today's Points will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Live Standings",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setSyncing(true);
            try {
              const result = await apiResetScores(token);
              if (result) {
                setScores(result.liveStandings);
                setTodayPoints(result.todayPoints);
              } else {
                Alert.alert("Reset Failed", "The server did not accept the reset. Try again.");
              }
            } catch (err: any) {
              if (err.message === "UNAUTHORIZED") logout();
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  };

  const rankedTeams = getRankedTeams(scores);
  const totalPoints = Object.values(scores).reduce((a, b) => a + b, 0);
  const todayTotal = Object.values(todayPoints).reduce((a, b) => a + b, 0);
  const leader = rankedTeams[0];
  const leaderScore = scores[leader.id] ?? 0;
  const isTie = leaderScore > 0 && (scores[rankedTeams[1].id] ?? 0) === leaderScore;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <Image source={schoolBg} style={styles.bgImage} resizeMode="cover" />
      <View style={styles.overlay} />
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <HistoryModal
        visible={showHistory}
        log={log}
        onClose={() => setShowHistory(false)}
        onClear={handleResetAll}
        canReset={isAdmin}
        onLoadMore={loadMoreLog}
        hasMore={hasMoreLog}
        loading={loadingMore}
      />

      <WeeklyModal
        visible={showWeekly}
        week={week}
        onClose={() => setShowWeekly(false)}
      />

      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerTop}>
          <Image
            source={schoolLogo}
            style={styles.schoolLogo}
            resizeMode="contain"
          />
          <View style={styles.headerActions}>
            <View style={styles.syncDot}>
              <View style={[
                styles.syncDotInner,
                { backgroundColor: syncing ? "#F5C518" : online ? "#42C97A" : "#E8503A" }
              ]} />
            </View>
            {teacher?.role === "admin" && (
              <TouchableOpacity
                onPress={() => setShowAdmin(true)}
                style={styles.resetAllBtn}
                activeOpacity={0.7}
              >
                <Feather name="settings" size={16} color={mutedColor} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowWeekly(true)}
              style={styles.resetAllBtn}
              activeOpacity={0.7}
            >
              <Feather name="bar-chart-2" size={16} color={mutedColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowHistory(true)}
              style={styles.resetAllBtn}
              activeOpacity={0.7}
            >
              <Feather name="clock" size={16} color={mutedColor} />
              {log.length > 0 && <View style={styles.logBadge} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleResetAll}
              style={styles.resetAllBtn}
              activeOpacity={0.7}
            >
              <Feather name="refresh-ccw" size={16} color={mutedColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={logout}
              style={styles.resetAllBtn}
              activeOpacity={0.7}
            >
              <Feather name="log-out" size={16} color={mutedColor} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.headerTitle}>Rafiki Games</Text>
        <View style={styles.teacherBadge}>
          <Feather name="user" size={12} color={mutedColor} />
          <Text style={[styles.teacherBadgeText, { color: mutedColor }]}>
            TR {teacher?.firstName} {teacher?.lastName} · {teacher?.block?.toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.headerSubtitle, { color: mutedColor }]}>
          {totalPoints} total point{totalPoints !== 1 ? "s" : ""} awarded
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomInset + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LiveScoresStrip scores={scores} />

        <DailyTotalsPanel todayPoints={todayPoints} />

        {rankedTeams.map((team, idx) => (
          <TeamCard
            key={team.id}
            team={team}
            score={scores[team.id] ?? 0}
            rank={idx}
            onAdd={(amount) => award(team.id, amount)}
            onSubtract={(amount) => award(team.id, -amount)}
            onReset={isAdmin ? () => handleResetTeam(team.id, team.name) : undefined}
          />
        ))}

        <Text style={[styles.hint, { color: mutedColor }]}>
          Long-press a card to reset that team
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    top: -100,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  teacherBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  teacherBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  schoolLogo: {
    width: 180,
    height: 80,
  },
  syncDot: {
    justifyContent: "center",
    alignItems: "center",
    width: 20,
    height: 20,
  },
  syncDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#f0f0f0",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  resetAllBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#21262D",
    alignItems: "center",
    justifyContent: "center",
  },
  logBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#5B8AF5",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  teamName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  rankLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8B949E",
    marginTop: 2,
  },
  scoreDisplay: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  scoreNumber: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    lineHeight: 52,
    letterSpacing: -2,
  },
  scorePts: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addButtons: {
    flexDirection: "row",
    gap: 6,
  },
  scoreBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBtnSmall: {
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  scoreBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  scoreBtnTextSmall: {
    fontSize: 14,
  },
  hint: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
