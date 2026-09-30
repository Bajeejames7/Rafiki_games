import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

const schoolLogo = require("@/assets/images/school-logo.png");

interface Props {
  onLogin: (username: string, password: string) => Promise<string | null>;
  onRecover: (username: string, code: string, newPassword: string) => Promise<string | null>;
}

export function LoginScreen({ onLogin, onRecover }: Props) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slowServer, setSlowServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");

  const switchMode = (toForgot: boolean) => {
    setForgot(toForgot);
    setError(null);
    setPassword("");
    setConfirm("");
    setCode("");
  };

  const handleRecover = async () => {
    const digits = code.replace(/\D/g, "");
    if (!username.trim()) { setError("Enter your username"); return; }
    if (digits.length !== 6) { setError("Enter the 6-digit code"); return; }
    if (password.trim().length < 4) { setError("New password must be at least 4 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError(null);
    setSlowServer(false);
    const slowTimer = setTimeout(() => setSlowServer(true), 5000);
    const err = await onRecover(username.trim(), digits, password.trim());
    clearTimeout(slowTimer);
    setLoading(false);
    setSlowServer(false);
    if (err) setError(err);
  };

  const handleLogin = async () => {
    if (!username.trim()) { setError("Enter your username"); return; }
    if (!password.trim()) { setError("Enter your password"); return; }
    setLoading(true);
    setError(null);
    setSlowServer(false);

    // Show "waking up server" message after 5 seconds
    const slowTimer = setTimeout(() => setSlowServer(true), 5000);

    const err = await onLogin(username.trim(), password.trim());
    clearTimeout(slowTimer);
    setLoading(false);
    setSlowServer(false);
    if (err) setError(err);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={schoolLogo} style={styles.logo} resizeMode="contain" />

        <Text style={styles.title}>Rafiki Games</Text>
        <Text style={styles.subtitle}>
          {forgot ? "Reset your password" : "Sign in to award virtue points"}
        </Text>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputWrap}>
              <Feather name="user" size={16} color="#8B949E" />
              <TextInput
                style={styles.input}
                placeholder="Your username"
                placeholderTextColor="#555"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>

          {forgot && (
            <>
              <Text style={styles.help}>
                Teachers: ask an admin to give you a reset code.{"\n"}
                Admins: use the 6-digit code in your authenticator app.
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>Code</Text>
                <View style={styles.inputWrap}>
                  <Feather name="hash" size={16} color="#8B949E" />
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="123456"
                    placeholderTextColor="#555"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={7}
                  />
                </View>
              </View>
            </>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>{forgot ? "New password" : "Password"}</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={16} color="#8B949E" />
              <TextInput
                style={styles.input}
                placeholder={forgot ? "At least 4 characters" : "Your password"}
                placeholderTextColor="#555"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType={forgot ? "next" : "done"}
                onSubmitEditing={forgot ? undefined : handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color="#8B949E" />
              </TouchableOpacity>
            </View>
          </View>

          {forgot && (
            <View style={styles.field}>
              <Text style={styles.label}>Confirm new password</Text>
              <View style={styles.inputWrap}>
                <Feather name="lock" size={16} color="#8B949E" />
                <TextInput
                  style={styles.input}
                  placeholder="Type it again"
                  placeholderTextColor="#555"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleRecover}
                />
              </View>
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={forgot ? handleRecover : handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.loginBtnText}>
                  {slowServer ? "Waking up server..." : forgot ? "Resetting..." : "Signing in..."}
                </Text>
              </View>
            ) : (
              <Text style={styles.loginBtnText}>{forgot ? "Reset Password & Sign In" : "Sign In"}</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => switchMode(!forgot)} disabled={loading}>
          <Text style={styles.forgotLink}>{forgot ? "Back to sign in" : "Forgot password?"}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Forgot your username? Ask an admin.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1117" },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24 },
  logo: { width: 180, height: 80, marginBottom: 16 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#f0f0f0", letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#8B949E", marginBottom: 32, textAlign: "center" },
  card: { width: "100%", backgroundColor: "#161B22", borderRadius: 20, borderWidth: 1, borderColor: "#30363D", padding: 24, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#8B949E", letterSpacing: 0.4 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#21262D", borderRadius: 12, borderWidth: 1, borderColor: "#30363D", paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: "#f0f0f0" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2D1B1B", borderRadius: 10, padding: 10 },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#ef4444", flex: 1 },
  loginBtn: { backgroundColor: "#5B8AF5", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  help: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8B949E", lineHeight: 19 },
  codeInput: { fontFamily: "Inter_700Bold", letterSpacing: 4, fontSize: 18 },
  forgotLink: { marginTop: 20, fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#5B8AF5", padding: 6 },
  hint: { marginTop: 8, fontSize: 12, fontFamily: "Inter_400Regular", color: "#8B949E66", textAlign: "center" },
});
