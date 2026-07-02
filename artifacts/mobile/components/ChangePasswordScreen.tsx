import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  teacherName: string;
  onSave: (newPassword: string) => Promise<string | null>;
}

export function ChangePasswordScreen({ teacherName, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (password.length < 4) { setError("Password must be at least 4 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError(null);
    const err = await onSave(password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Feather name="lock" size={40} color="#5B8AF5" style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Set Your Password</Text>
        <Text style={styles.subtitle}>
          Welcome, {teacherName}! Please create a new password before continuing.
        </Text>

        <View style={styles.inputWrap}>
          <Feather name="lock" size={15} color="#8B949E" />
          <TextInput
            style={styles.input}
            placeholder="New password (min 4 chars)"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
          />
          <TouchableOpacity onPress={() => setShow((v) => !v)}>
            <Feather name={show ? "eye-off" : "eye"} size={15} color="#8B949E" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputWrap}>
          <Feather name="lock" size={15} color="#8B949E" />
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor="#555"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!show}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save Password</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1117" },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#f0f0f0", letterSpacing: -0.3 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#8B949E", textAlign: "center", marginBottom: 8 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", width: "100%",
    backgroundColor: "#21262D", borderRadius: 12, borderWidth: 1,
    borderColor: "#30363D", paddingHorizontal: 14, paddingVertical: 13, gap: 10,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: "#f0f0f0" },
  error: { color: "#ef4444", fontSize: 13, fontFamily: "Inter_500Medium" },
  btn: { backgroundColor: "#5B8AF5", borderRadius: 14, paddingVertical: 14, width: "100%", alignItems: "center" },
  btnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
