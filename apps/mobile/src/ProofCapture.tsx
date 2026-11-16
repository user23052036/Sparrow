import { useEffect, useState } from "react";
import { AppState, Switch, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { randomUUID } from "expo-crypto";
import { base64ToBytes, compressWithin, copy, exifTextAgeHours, PHOTO_OLDER_AFTER_HOURS } from "@sparrow/shared";
import { errorText, notifyPartner, supabase } from "./supabase";
import { Button, Err } from "./ui";
import { s } from "./theme";

/** Which item the camera was opened for, so a photo taken while Android closed Sparrow still finds its place. */
const CAMERA_ITEM = "sparrow:cameraItem";
type Photo = ImagePicker.ImagePickerAsset;

/**
 * A photo the camera returned after Android closed Sparrow, handed to the item it belongs to exactly once. It is
 * read again whenever Sparrow comes back to the front (Android may have closed only the screen, not the app).
 */
let pending: Promise<{ itemId: string; photo: Photo } | null> | null = null;
const recovered = new Set<string>();
AppState.addEventListener("change", (st) => {
  if (st === "active") pending = null;
});
async function takePendingPhoto(itemId: string): Promise<Photo | null> {
  const p = await pendingPhoto();
  if (!p || p.itemId !== itemId || recovered.has(p.photo.uri)) return null;
  recovered.add(p.photo.uri);
  pending = Promise.resolve(null);
  return p.photo;
}
function pendingPhoto() {
  pending ??= (async () => {
    try {
      const [res, itemId] = await Promise.all([ImagePicker.getPendingResultAsync(), AsyncStorage.getItem(CAMERA_ITEM)]);
      await AsyncStorage.removeItem(CAMERA_ITEM);
      const photo = res && "assets" in res && !res.canceled ? res.assets?.[0] : null;
      return photo && itemId ? { itemId, photo } : null;
    } catch {
      return null;
    }
  })();
  return pending;
}

/**
 * Re-encodes on the phone, which drops the photo's hidden details (place, camera) before upload. Each size step
 * decodes the photo already scaled down, so a large camera photo is never held in memory at full size.
 */
async function encode(photo: Photo): Promise<Uint8Array> {
  const { bytes } = await compressWithin(async ({ max, quality }) => {
    const ctx = ImageManipulator.manipulate(photo.uri, { maxWidth: max, maxHeight: max });
    const image = await ctx.renderAsync();
    try {
      const out = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true });
      if (!out.base64) throw new Error(copy.proof.processError);
      const b = base64ToBytes(out.base64);
      return { bytes: b, size: b.length };
    } finally {
      image.release();
      ctx.release();
    }
  });
  return bytes;
}

/**
 * Proof for one planned item on the phone (ROADMAP T3.1): a photo through the system camera, or a written note.
 * The photo's own date is read before re-encoding, for the same gentle note the website gives (D32).
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

  async function savePhoto(photo: Photo) {
    setBusy(true);
    setErr(null);
    try {
      const exif = photo.exif ?? {};
      const age = exifTextAgeHours(exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.DateTime, new Date());
      const bytes = await encode(photo);
      const path = `${userId}/${randomUUID()}.jpg`;
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

  useEffect(() => {
    let live = true;
    void takePendingPhoto(itemId).then((photo) => {
      if (live && photo) void savePhoto(photo);
    });
    return () => {
      live = false;
    };
    // Once, when the item appears: a photo from before Android closed Sparrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  async function takePhoto() {
    setErr(null);
    let photo: Photo | null | undefined;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setErr(copy.proof.cameraDenied);
        return;
      }
      await AsyncStorage.setItem(CAMERA_ITEM, itemId);
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: true });
      await AsyncStorage.removeItem(CAMERA_ITEM);
      photo = shot.canceled ? null : shot.assets?.[0];
    } catch {
      // No camera app, or Android said no (older phones also ask for storage access here).
      setErr(copy.proof.cameraDenied);
      return;
    }
    if (photo) await savePhoto(photo);
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
