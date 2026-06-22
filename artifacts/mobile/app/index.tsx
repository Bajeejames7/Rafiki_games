import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import colors from "@/constants/colors";

const schoolLogo = require("@/assets/images/school-logo.png");

const STORAGE_KEY = "@virtue_points";

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
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const bg = isDark ? colors.dark.background : "#0D1117";
  const cardBg = isDark ? colors.dark.card : "#161B22";
  const textColor = "#f0f0f0";
  const mutedColor = "#8B949E";

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setScores(JSON.parse(raw));
        } catch {}
      }
    });
  }, []);

  const updateScores = useCallback((newScores: Scores) => {
    setScores(newScores);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newScores));
  }, []);

  const handleAdd = (teamId: string, amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateScores({ ...scores, [teamId]: (scores[teamId] ?? 0) + amount });
  };

  const handleSubtract = (teamId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = scores[teamId] ?? 0;
    updateScores({ ...scores, [teamId]: Math.max(0, current - 1) });
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
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />

      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerTop}>
          <Image
            source={schoolLogo}
            style={styles.schoolLogo}
            resizeMode="contain"
          />
          <TouchableOpacity
            onPress={handleResetAll}
            style={styles.resetAllBtn}
            activeOpacity={0.7}
          >
            <Feather name="refresh-ccw" size={16} color={mutedColor} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Virtue Points</Text>
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
