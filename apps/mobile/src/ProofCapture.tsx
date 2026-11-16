import { useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { base64ToBytes, compressWithin, copy, exifTextAgeHours, PHOTO_OLDER_AFTER_HOURS } from "@sparrow/shared";
import { errorText, notifyPartner, supabase } from "./supabase";
import { uuid } from "./device";
import { Button, Err } from "./ui";
import { s } from "./theme";

/**
 * Proof for one planned item on the phone (ROADMAP T3.1): a photo through the system camera, or a written note.
 * The photo is re-encoded on the phone, which drops its hidden details (place, camera) before upload; its own
 * date is read first, for the same gentle note the website gives (D32).
 */
export function ProofCapture({
  itemId,
  userId,
  partnerName,
  onSaved,
}: {
  itemId: string;
  userId: string;
  partnerName: string | null;
  onSaved: (note: string) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const visibility = share && partnerName ? "buddy" : "private";

  async function takePhoto() {
    setErr(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setErr(copy.proof.cameraDenied);
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: true });
    const photo = shot.canceled ? null : shot.assets?.[0];
    if (!photo) return;
    setBusy(true);
    try {
      const exif = photo.exif ?? {};
      const age = exifTextAgeHours(exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.DateTime, new Date());
      const { bytes } = await compressWithin(async ({ max, quality }) => {
        const resize = photo.width >= photo.height ? { width: Math.min(max, photo.width) } : { height: Math.min(max, photo.height) };
        const out = await manipulateAsync(photo.uri, [{ resize }], { compress: quality, format: SaveFormat.JPEG, base64: true });
        const b = base64ToBytes(out.base64 ?? "");
        return { bytes: b, size: b.length };
      });
      const path = `${userId}/${uuid()}.jpg`;
      const up = await supabase.storage.from("proofs").upload(path, bytes.buffer as ArrayBuffer, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { data, error } = await supabase
        .from("proofs")
        .insert({ plan_item_id: itemId, kind: "photo", storage_path: path, visibility, ...(age === null ? {} : { photo_age_hours: age }) })
        .select("id")
        .single();
      if (error) throw error;
      if (visibility === "buddy") notifyPartner("proof_shared", data?.id);
      onSaved(age !== null && age > PHOTO_OLDER_AFTER_HOURS ? copy.proof.olderPhoto : copy.proof.photoSaved);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase
      .from("proofs")
      .insert({ plan_item_id: itemId, kind: "text", text_body: text.trim(), visibility })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      setErr(errorText(error));
      return;
    }
    if (visibility === "buddy") notifyPartner("proof_shared", data?.id);
    setText("");
    setWriting(false);
    onSaved(copy.proof.noteSaved);
  }

  return (
    <View style={{ gap: 8 }}>
      {partnerName && (
        <View style={s.spread}>
          <Text style={[s.quiet, { flex: 1 }]}>{copy.proof.sharePrefix(partnerName)}</Text>
          <Switch value={share} onValueChange={setShare} accessibilityLabel={copy.proof.sharePrefix(partnerName)} />
        </View>
      )}
      {writing ? (
        <>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder={copy.proof.noteLabel}
            accessibilityLabel={copy.proof.noteLabel}
            multiline
            maxLength={2000}
          />
          <View style={s.row}>
            <Button label={copy.proof.saveNote} primary disabled={busy || !text.trim()} onPress={saveNote} />
            <Button label={copy.proof.cancel} onPress={() => setWriting(false)} />
          </View>
        </>
      ) : (
        <View style={s.row}>
          <Button label={busy ? copy.proof.saving : copy.proof.addPhoto} disabled={busy} onPress={takePhoto} />
          <Button label={copy.proof.writeNote} disabled={busy} onPress={() => setWriting(true)} />
        </View>
      )}
      <Err>{err}</Err>
    </View>
  );
}
