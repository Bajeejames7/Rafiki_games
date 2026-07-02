import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Modal, Alert, ActivityIndicator, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "https://rafiki-games.onrender.com/api";

const BLOCKS = ["primary", "jss", "sss"] as const;
type Block = typeof BLOCKS[number];

interface TeacherEntry {
  id: number;
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
  const [showResetId, setShowResetId] = useState<number | null>(null);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${API_BASE}/admin/teachers`, { headers });
    if (res.ok) setTeachers(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  const handleDelete = (t: TeacherEntry) => {
    Alert.alert(`Delete ${t.firstName} ${t.lastName}?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          await fetch(`${API_BASE}/admin/teachers/${t.id}`, { method: "DELETE", headers });
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
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {teachers.map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.idBadge}>
                  <Text style={styles.idText}>ID: {t.id}</Text>
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
                  onPress={() => setShowResetId(t.id)}
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

      <ResetPasswordModal
        visible={showResetId !== null}
        teacherId={showResetId!}
        token={token}
        onClose={() => setShowResetId(null)}
      />
    </View>
  );
}

function CreateTeacherModal({ visible, token, onClose, onCreated }: {
  visible: boolean; token: string; onClose: () => void; onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [block, setBlock] = useState<Block>("primary");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "admin">("teacher");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTeacher, setCreatedTeacher] = useState<{ id: number; name: string } | null>(null);

  const reset = () => {
    setFirstName(""); setLastName(""); setBlock("primary");
    setPassword(""); setRole("teacher"); setError(null); setCreatedTeacher(null);
  };

  const handleCreate = async () => {
    if (!firstName.trim() || !lastName.trim() || !password.trim()) {
      setError("All fields required"); return;
    }
    if (password.length < 4) { setError("Password min 4 chars"); return; }
    setLoading(true); setError(null);
    const res = await fetch(`${API_BASE}/admin/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), block, password, role }),
    });
    setLoading(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: "Failed" }));
      setError(e.error); return;
    }
    const t = await res.json();
    setCreatedTeacher({ id: t.id, name: `${t.firstName} ${t.lastName}` });
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
              <Text style={styles.idPillText}>ID: {createdTeacher.id}</Text>
            </View>
            <Text style={styles.successHint}>Share this ID + password with the teacher so they can log in.</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.modalTitle}>New Teacher</Text>
            <TextInput style={styles.modalInput} placeholder="First name" placeholderTextColor="#555" value={firstName} onChangeText={setFirstName} />
            <TextInput style={styles.modalInput} placeholder="Last name" placeholderTextColor="#555" value={lastName} onChangeText={setLastName} />

            <Text style={styles.modalLabel}>Block</Text>
            <View style={styles.blockRow}>
              {BLOCKS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.blockBtn, block === b && styles.blockBtnActive]}
                  onPress={() => setBlock(b)}
                >
                  <Text style={[styles.blockBtnText, block === b && styles.blockBtnTextActive]}>
                    {b.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Role</Text>
            <View style={styles.blockRow}>
              {(["teacher", "admin"] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.blockBtn, role === r && styles.blockBtnActive]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.blockBtnText, role === r && styles.blockBtnTextActive]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
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

function ResetPasswordModal({ visible, teacherId, token, onClose }: {
  visible: boolean; teacherId: number; token: string; onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (newPassword.length < 4) return;
    setLoading(true);
    await fetch(`${API_BASE}/admin/teachers/${teacherId}/reset-password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newPassword }),
    });
    setLoading(false);
    setDone(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.modal, { gap: 12 }]}>
        <Text style={styles.modalTitle}>Reset Password</Text>
        {done ? (
          <>
            <Feather name="check-circle" size={32} color="#42C97A" style={{ alignSelf: "center" }} />
            <Text style={[styles.modalLabel, { textAlign: "center" }]}>Password reset. Teacher must change it on next login.</Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => { setDone(false); setNewPassword(""); onClose(); }}>
              <Text style={styles.createBtnText}>Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput style={styles.modalInput} placeholder="New password" placeholderTextColor="#555" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <TouchableOpacity style={[styles.createBtn, loading && { opacity: 0.5 }]} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Reset Password</Text>}
            </TouchableOpacity>
          </>
        )}
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
  idPill: { backgroundColor: "#5B8AF522", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: "#5B8AF5" },
  idPillText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#5B8AF5" },
  successHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8B949E", textAlign: "center" },
  doneBtn: { backgroundColor: "#42C97A22", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, borderWidth: 1, borderColor: "#42C97A" },
  doneBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#42C97A" },
});
