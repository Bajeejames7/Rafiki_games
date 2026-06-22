import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  ImageBackground,
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

const schoolLogo = require("@/assets/images/school-logo.png");
const schoolBg = require("@/assets/images/school-bg.jpg");

const STORAGE_KEY = "@virtue_points";
const TEACHER_KEY = "@virtue_teacher";
const LOG_KEY = "@virtue_log";

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

function HistoryModal({
  visible,
  log,
  onClose,
  onClear,
}: {
  visible: boolean;
  log: LogEntry[];
  onClose: () => void;
  onClear: () => void;
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
              <Text style={histStyles.sheetSub}>{log.length} event{log.length !== 1 ? "s" : ""} recorded</Text>
            </View>
            <View style={histStyles.headerBtns}>
              {log.length > 0 && (
                <TouchableOpacity onPress={onClear} style={histStyles.clearBtn} activeOpacity={0.7}>
                  <Feather name="trash-2" size={14} color="#ef4444" />
                  <Text style={histStyles.clearBtnText}>Clear</Text>
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
              {[...log].reverse().map((entry) => {
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
  onSubtract: () => void;
  onReset: () => void;
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

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onReset();
  };

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
          <ScoreButton label="−1" onPress={onSubtract} color={colors.light.destructive} small />
          <View style={styles.addButtons}>
            <ScoreButton label="+1" onPress={() => handleAdd(1)} color={tc.primary} small />
            <ScoreButton label="+5" onPress={() => handleAdd(5)} color={tc.primary} small />
            <ScoreButton label="+10" onPress={() => handleAdd(10)} color={tc.primary} />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [scores, setScores] = useState<Scores>({
    wisdom: 0,
    justice: 0,
    fortitude: 0,
    temperance: 0,
  });
  const [teacherName, setTeacherName] = useState("");
  const [teacherClass, setTeacherClass] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const bg = isDark ? colors.dark.background : "#0D1117";
  const mutedColor = "#8B949E";

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(TEACHER_KEY),
      AsyncStorage.getItem(LOG_KEY),
    ]).then(([rawScores, rawTeacher, rawLog]) => {
      if (rawScores) {
        try { setScores(JSON.parse(rawScores)); } catch {}
      }
      if (rawTeacher) {
        try {
          const t = JSON.parse(rawTeacher);
          setTeacherName(t.name ?? "");
          setTeacherClass(t.className ?? "");
        } catch {}
      } else {
        setShowSetup(true);
      }
      if (rawLog) {
        try { setLog(JSON.parse(rawLog)); } catch {}
      }
    });
  }, []);

  const addLogEntry = useCallback((teamId: string, teamName: string, amount: number, tName: string, tClass: string) => {
    setLog((prev) => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        teacherName: tName,
        teacherClass: tClass,
        teamId,
        teamName,
        amount,
        timestamp: Date.now(),
      };
      const next = [...prev, entry];
      AsyncStorage.setItem(LOG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSaveTeacher = (name: string, className: string) => {
    setTeacherName(name);
    setTeacherClass(className);
    setShowSetup(false);
    AsyncStorage.setItem(TEACHER_KEY, JSON.stringify({ name, className }));
  };

  const updateScores = useCallback((newScores: Scores) => {
    setScores(newScores);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newScores));
  }, []);

  const handleAdd = (teamId: string, amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateScores({ ...scores, [teamId]: (scores[teamId] ?? 0) + amount });
    const team = TEAMS.find((t) => t.id === teamId);
    addLogEntry(teamId, team?.name ?? teamId, amount, teacherName, teacherClass);
  };

  const handleSubtract = (teamId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = scores[teamId] ?? 0;
    if (current === 0) return;
    updateScores({ ...scores, [teamId]: current - 1 });
    const team = TEAMS.find((t) => t.id === teamId);
    addLogEntry(teamId, team?.name ?? teamId, -1, teacherName, teacherClass);
  };

  const handleClearLog = () => {
    Alert.alert("Clear log?", "All recorded events will be deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setLog([]);
          AsyncStorage.removeItem(LOG_KEY);
        },
      },
    ]);
  };

  const handleResetTeam = (teamId: string, teamName: string) => {
    Alert.alert(
      `Reset ${teamName}?`,
      "This will set their points to 0.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            updateScores({ ...scores, [teamId]: 0 });
          },
        },
      ]
    );
  };

  const handleResetAll = () => {
    Alert.alert(
      "Reset All Teams?",
      "This will set all teams' points back to zero.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset All",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            updateScores({
              wisdom: 0,
              justice: 0,
              fortitude: 0,
              temperance: 0,
            });
          },
        },
      ]
    );
  };

  const rankedTeams = getRankedTeams(scores);
  const totalPoints = Object.values(scores).reduce((a, b) => a + b, 0);
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

      <TeacherSetupModal
        visible={showSetup}
        initial={{ name: teacherName, className: teacherClass }}
        onSave={handleSaveTeacher}
      />

      <HistoryModal
        visible={showHistory}
        log={log}
        onClose={() => setShowHistory(false)}
        onClear={handleClearLog}
      />

      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerTop}>
          <Image
            source={schoolLogo}
            style={styles.schoolLogo}
            resizeMode="contain"
          />
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setShowHistory(true)}
              style={styles.resetAllBtn}
              activeOpacity={0.7}
            >
              <Feather name="clock" size={16} color={mutedColor} />
              {log.length > 0 && <View style={styles.logBadge} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowSetup(true)}
              style={styles.resetAllBtn}
              activeOpacity={0.7}
            >
              <Feather name="user" size={16} color={mutedColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleResetAll}
              style={styles.resetAllBtn}
              activeOpacity={0.7}
            >
              <Feather name="refresh-ccw" size={16} color={mutedColor} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.headerTitle}>Virtue Points</Text>
        {teacherName ? (
          <View style={styles.teacherBadge}>
            <Feather name="user" size={12} color={mutedColor} />
            <Text style={[styles.teacherBadgeText, { color: mutedColor }]}>
              {teacherName} · {teacherClass}
            </Text>
          </View>
        ) : (
          <Text style={[styles.headerSubtitle, { color: mutedColor }]}>
            {totalPoints} total point{totalPoints !== 1 ? "s" : ""} awarded
          </Text>
        )}
        {teacherName ? (
          <Text style={[styles.headerSubtitle, { color: mutedColor }]}>
            {totalPoints} total point{totalPoints !== 1 ? "s" : ""} awarded
          </Text>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomInset + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LeaderBanner team={isTie ? null : leader} score={leaderScore} isTie={isTie} />

        {rankedTeams.map((team, idx) => (
          <TeamCard
            key={team.id}
            team={team}
            score={scores[team.id] ?? 0}
            rank={idx}
            onAdd={(amount) => handleAdd(team.id, amount)}
            onSubtract={() => handleSubtract(team.id)}
            onReset={() => handleResetTeam(team.id, team.name)}
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
    width: 160,
    height: 60,
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
    gap: 8,
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
    paddingHorizontal: 14,
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
