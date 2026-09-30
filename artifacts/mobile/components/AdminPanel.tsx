import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Modal, Alert, ActivityIndicator, Pressable, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { API_BASE } from "@/constants/api";


const BLOCKS = ["primary", "jss", "sss"] as const;
type Block = typeof BLOCKS[number];

interface TeacherEntry {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  block: string;
  role: string;
  mustChangePassword: boolean;
  createdAt: string;
}

interface Props {
  token: string;
  onClose: () => void;
}

export function AdminPanel({ token, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [teachers, setTeachers] = useState<TeacherEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [resetFor, setResetFor] = useState<TeacherEntry | null>(null);
  const [showAuthenticator, setShowAuthenticator] = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/teachers`, { headers });
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      setTeachers(await res.json());
      setLoadError(null);
    } catch {
      setLoadError("Could not load teachers. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  const handleDelete = (t: TeacherEntry) => {
    Alert.alert(`Delete ${t.firstName} ${t.lastName}?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            const res = await fetch(`${API_BASE}/admin/teachers/${t.id}`, { method: "DELETE", headers });
            if (!res.ok) {
              const e = await res.json().catch(() => ({}));
              Alert.alert("Not deleted", e.error ?? "The server refused the delete.");
            }
          } catch {
            Alert.alert("Not deleted", "Could not reach the server. Try again.");
          }
          fetchTeachers();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Panel</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setShowAuthenticator(true)}>
            <Feather name="shield" size={17} color="#42C97A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Feather name="user-plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add Teacher</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Feather name="x" size={18} color="#8B949E" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#5B8AF5" style={{ marginTop: 40 }} />
      ) : loadError ? (
        <TouchableOpacity onPress={fetchTeachers} style={{ padding: 24, alignItems: "center", gap: 8 }}>
          <Text style={styles.meta}>{loadError}</Text>
          <Text style={[styles.meta, { color: "#5B8AF5" }]}>Tap to retry</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {teachers.map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.idBadge}>
                  <Text style={styles.idText}>@{t.username}</Text>
                </View>
                <View>
                  <Text style={styles.name}>{t.firstName} {t.lastName}</Text>
                  <Text style={styles.meta}>
                    {t.block.toUpperCase()} · {t.role}
                    {t.mustChangePassword ? " · ⚠️ Must change PW" : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setResetFor(t)}
                >
                  <Feather name="key" size={14} color="#F5C518" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#2D1B1B" }]}
                  onPress={() => handleDelete(t)}
                >
                  <Feather name="trash-2" size={14} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <CreateTeacherModal
        visible={showCreate}
        token={token}
        onClose={() => setShowCreate(false)}
        onCreated={fetchTeachers}
      />

      {resetFor && (
        <ResetPasswordModal
          teacher={resetFor}
          token={token}
          onClose={() => setResetFor(null)}
        />
      )}

      {showAuthenticator && (
        <AuthenticatorModal token={token} onClose={() => setShowAuthenticator(false)} />
      )}
    </View>
  );
}

function CreateTeacherModal({ visible, token, onClose, onCreated }: {
  visible: boolean; token: string; onClose: () => void; onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [block, setBlock] = useState<Block>("primary");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "admin">("teacher");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTeacher, setCreatedTeacher] = useState<{ id: number; username: string; name: string } | null>(null);

  const reset = () => {
    setUsername(""); setFirstName(""); setLastName(""); setBlock("primary");
    setPassword(""); setRole("teacher"); setError(null); setCreatedTeacher(null);
  };

  const handleCreate = async () => {
    if (!username.trim() || !firstName.trim() || !lastName.trim() || !password.trim()) {
      setError("All fields required"); return;
    }
    if (password.length < 4) { setError("Password min 4 chars"); return; }
    setLoading(true); setError(null);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/admin/teachers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: username.trim(), firstName: firstName.trim(), lastName: lastName.trim(), block, password, role }),
      });
    } catch {
      setLoading(false);
      setError("Could not reach the server. Try again.");
      return;
    }
    setLoading(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: "Failed" }));
      setError(e.error); return;
    }
    const t = await res.json();
    setCreatedTeacher({ id: t.id, username: t.username, name: `${t.firstName} ${t.lastName}` });
    onCreated();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.modal}>
        {createdTeacher ? (
          <View style={styles.successBox}>
            <Feather name="check-circle" size={40} color="#42C97A" />
            <Text style={styles.successTitle}>Teacher Created!</Text>
            <Text style={styles.successName}>{createdTeacher.name}</Text>
            <View style={styles.idPill}>
              <Text style={styles.idPillLabel}>Username</Text>
              <Text style={styles.idPillText}>{createdTeacher.username}</Text>
            </View>
            <Text style={styles.successHint}>Share the username + temporary password with the teacher to log in.</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.modalTitle}>New Teacher</Text>
            <TextInput style={styles.modalInput} placeholder="Username (e.g. mrs.johnson)" placeholderTextColor="#555" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
            <TextInput style={styles.modalInput} placeholder="First name" placeholderTextColor="#555" value={firstName} onChangeText={setFirstName} />
            <TextInput style={styles.modalInput} placeholder="Last name" placeholderTextColor="#555" value={lastName} onChangeText={setLastName} />

            <Text style={styles.modalLabel}>Block</Text>
            <View style={styles.blockRow}>
              {BLOCKS.map((b) => (
                <TouchableOpacity key={b} style={[styles.blockBtn, block === b && styles.blockBtnActive]} onPress={() => setBlock(b)}>
                  <Text style={[styles.blockBtnText, block === b && styles.blockBtnTextActive]}>{b.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Role</Text>
            <View style={styles.blockRow}>
              {(["teacher", "admin"] as const).map((r) => (
                <TouchableOpacity key={r} style={[styles.blockBtn, role === r && styles.blockBtnActive]} onPress={() => setRole(r)}>
                  <Text style={[styles.blockBtnText, role === r && styles.blockBtnTextActive]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput style={styles.modalInput} placeholder="Temporary password" placeholderTextColor="#555" value={password} onChangeText={setPassword} secureTextEntry />
            {error && <Text style={styles.modalError}>{error}</Text>}
            <TouchableOpacity style={[styles.createBtn, loading && { opacity: 0.5 }]} onPress={handleCreate} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Teacher</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

function ResetPasswordModal({ teacher, token, onClose }: {
  teacher: TeacherEntry; token: string; onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState<"code" | "password" | null>(null);
  const [done, setDone] = useState(false);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCode = async () => {
    setLoading("code"); setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/teachers/${teacher.id}/reset-code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setIssued({ code: body.code, expiresAt: body.expiresAt });
      else setError(body.error ?? "Could not make a code");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleReset = async () => {
    if (newPassword.length < 4) { setError("Password min 4 chars"); return; }
    setLoading("password"); setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/teachers/${teacher.id}/reset-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) setDone(true);
      else setError((await res.json().catch(() => ({}))).error ?? "Reset failed");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(null);
    }
  };

  const expiry = issued
    ? new Date(issued.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.modal, { gap: 12 }]}>
        <Text style={styles.modalTitle}>Reset Password</Text>
        <Text style={styles.meta}>{teacher.firstName} {teacher.lastName} · @{teacher.username}</Text>
        {issued ? (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{issued.code.slice(0, 3)} {issued.code.slice(3)}</Text>
            </View>
            <Text style={[styles.successHint, { textAlign: "left" }]}>
              Tell {teacher.firstName} to open the app, tap "Forgot password?", and enter the username{" "}
              <Text style={{ color: "#f0f0f0" }}>{teacher.username}</Text> with this code. It works once and
              expires at {expiry}.
            </Text>
            <TouchableOpacity style={styles.createBtn} onPress={onClose}>
              <Text style={styles.createBtnText}>Done</Text>
            </TouchableOpacity>
          </>
        ) : done ? (
          <>
            <Feather name="check-circle" size={32} color="#42C97A" style={{ alignSelf: "center" }} />
            <Text style={[styles.modalLabel, { textAlign: "center" }]}>Password reset. Teacher must change it on next login.</Text>
            <TouchableOpacity style={styles.createBtn} onPress={onClose}>
              <Text style={styles.createBtnText}>Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.createBtn, loading && { opacity: 0.5 }]} onPress={handleCode} disabled={!!loading}>
              {loading === "code" ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Give a Reset Code</Text>}
            </TouchableOpacity>
            <Text style={[styles.modalLabel, { textAlign: "center", marginTop: 4 }]}>OR SET A TEMPORARY PASSWORD</Text>
            <TextInput style={styles.modalInput} placeholder="Temporary password" placeholderTextColor="#555" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <TouchableOpacity style={[styles.secondaryBtn, loading && { opacity: 0.5 }]} onPress={handleReset} disabled={!!loading}>
              {loading === "password" ? <ActivityIndicator color="#5B8AF5" /> : <Text style={styles.secondaryBtnText}>Set Temporary Password</Text>}
            </TouchableOpacity>
            {error && <Text style={styles.modalError}>{error}</Text>}
          </>
        )}
      </View>
    </Modal>
  );
}

// Link an authenticator app to the signed-in admin's own account, so they can
// reset their password with it if they forget it.
function AuthenticatorModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/auth/authenticator`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEnabled(d.enabled))
      .catch(() => setError("Could not reach the server. Close and try again."));
  }, [token]);

  const post = async (path: string, body?: object) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/authenticator/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return null; }
      return data;
    } catch {
      setError("Could not reach the server. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const data = await post("setup");
    if (data) { setSetup(data); setCode(""); }
  };

  const confirm = async () => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) { setError("Enter the 6-digit code from the app"); return; }
    if (await post("confirm", { code: digits })) { setSetup(null); setEnabled(true); }
  };

  const turnOff = () => {
    Alert.alert("Turn off the authenticator?", "You will not be able to reset your own password with it until you set it up again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Turn off", style: "destructive", onPress: async () => { if (await post("disable")) setEnabled(false); } },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.modal, { maxHeight: "92%" }]}>
        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Password Recovery</Text>
          {enabled === null && !error ? (
            <ActivityIndicator color="#5B8AF5" />
          ) : setup ? (
            <>
              <Text style={[styles.successHint, { textAlign: "left" }]}>
                1. Install Google Authenticator or Microsoft Authenticator on your phone.{"\n"}
                2. In the app, tap "+" then "Scan a QR code" and scan this.
              </Text>
              <View style={styles.qrWrap}>
                <Image source={{ uri: setup.qr }} style={styles.qr} />
              </View>
              <Text style={[styles.meta, { textAlign: "center" }]}>Can't scan? Choose "Enter a setup key" and type:</Text>
              <Text selectable style={styles.secretText}>{setup.secret.match(/.{1,4}/g)?.join(" ")}</Text>
              <Text style={[styles.successHint, { textAlign: "left" }]}>3. Enter the 6-digit code the app now shows:</Text>
              <TextInput
                style={[styles.modalInput, styles.codeInput]}
                placeholder="123456"
                placeholderTextColor="#555"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={7}
              />
              {error && <Text style={styles.modalError}>{error}</Text>}
              <TouchableOpacity style={[styles.createBtn, busy && { opacity: 0.5 }]} onPress={confirm} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Confirm</Text>}
              </TouchableOpacity>
              <Text style={[styles.meta, { textAlign: "center" }]}>Keep this screen private: anyone who scans it can reset your password.</Text>
            </>
          ) : enabled ? (
            <>
              <Feather name="shield" size={32} color="#42C97A" style={{ alignSelf: "center" }} />
              <Text style={styles.successHint}>
                Your authenticator app is linked. If you forget your password, tap "Forgot password?" on the
                sign-in screen and enter the code from the app.
              </Text>
              {error && <Text style={styles.modalError}>{error}</Text>}
              <TouchableOpacity style={styles.createBtn} onPress={onClose}>
                <Text style={styles.createBtnText}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={turnOff} disabled={busy}>
                <Text style={[styles.secondaryBtnText, { color: "#ef4444" }]}>Turn off (e.g. to move to a new phone)</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.successHint, { textAlign: "left" }]}>
                Link an authenticator app to your account. If you ever forget your password, the app gives you
                a code to set a new one, with no email needed.{"\n\n"}
                For teachers who forget their password, tap the key next to their name and give them a reset code.
              </Text>
              {error && <Text style={styles.modalError}>{error}</Text>}
              {enabled === false && (
                <TouchableOpacity style={[styles.createBtn, busy && { opacity: 0.5 }]} onPress={start} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Set Up Authenticator</Text>}
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1117" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderColor: "#21262D" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#f0f0f0" },
  headerBtns: { flexDirection: "row", gap: 10, alignItems: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#5B8AF5", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#21262D", alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: "#161B22", borderRadius: 14, borderWidth: 1, borderColor: "#30363D", padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  idBadge: { backgroundColor: "#21262D", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  idText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#5B8AF5" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#f0f0f0" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#8B949E", marginTop: 2 },
  cardActions: { flexDirection: "row", gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: "#21262D", alignItems: "center", justifyContent: "center" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modal: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#161B22", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: "#30363D", padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#f0f0f0", marginBottom: 4 },
  modalLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8B949E", letterSpacing: 0.5 },
  modalInput: { backgroundColor: "#21262D", borderRadius: 12, borderWidth: 1, borderColor: "#30363D", paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: "#f0f0f0" },
  blockRow: { flexDirection: "row", gap: 8 },
  blockBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#21262D", alignItems: "center", borderWidth: 1, borderColor: "#30363D" },
  blockBtnActive: { backgroundColor: "#5B8AF522", borderColor: "#5B8AF5" },
  blockBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#8B949E" },
  blockBtnTextActive: { color: "#5B8AF5" },
  modalError: { color: "#ef4444", fontSize: 13, fontFamily: "Inter_500Medium" },
  createBtn: { backgroundColor: "#5B8AF5", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  createBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  successBox: { alignItems: "center", gap: 10, paddingVertical: 8 },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#f0f0f0" },
  successName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#8B949E" },
  idPill: { backgroundColor: "#5B8AF522", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: "#5B8AF5", alignItems: "center" },
  idPillLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#5B8AF5", letterSpacing: 1, marginBottom: 2 },
  idPillText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#5B8AF5" },
  successHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8B949E", textAlign: "center" },
  doneBtn: { backgroundColor: "#42C97A22", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, borderWidth: 1, borderColor: "#42C97A" },
  secondaryBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#30363D" },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#5B8AF5" },
  codeBox: { alignSelf: "center", backgroundColor: "#5B8AF522", borderRadius: 14, borderWidth: 1, borderColor: "#5B8AF5", paddingHorizontal: 28, paddingVertical: 14 },
  codeText: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#f0f0f0", letterSpacing: 6 },
  codeInput: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: 6, textAlign: "center" },
  qrWrap: { alignSelf: "center", backgroundColor: "#fff", borderRadius: 12, padding: 8 },
  qr: { width: 220, height: 220 },
  secretText: { textAlign: "center", fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#f0f0f0", letterSpacing: 1 },
  doneBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#42C97A" },
});
