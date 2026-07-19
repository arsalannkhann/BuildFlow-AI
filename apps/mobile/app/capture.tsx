// /capture — record → pause/resume/finish with a visible timer, playback
// before submit, photos (camera/gallery with EXIF), optional note, project +
// date confirmation. Submit = durable local save FIRST, then background sync.
// This screen never requires connectivity.

import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { exifHasLocation, exifTimestampToIso, isoNowWithOffset } from "../src/lib/exif";
import { useI18n } from "../src/lib/i18n";
import type { CaptureAttachmentInput } from "../src/lib/sync/types";
import { useSession } from "../src/state/session";
import { useSync } from "../src/state/sync";
import {
  BodyText,
  Card,
  PrimaryButton,
  SecondaryButton,
  SupportingText,
} from "../src/ui/components";
import { TOUCH_TARGET, colors, radius, spacing } from "../src/ui/theme";

type Phase = "idle" | "recording" | "paused" | "recorded";

interface PhotoDraft {
  uri: string;
  contentType: string;
  capturedAt?: string;
  hasLocation: boolean;
}

const formatTimer = (millis: number): string => {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const todayIsoDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
};

export default function CaptureScreen() {
  useKeepAwake(); // recording must survive the screen dimming (design.md §6)
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const { submitCapture, saveDraft } = useSync();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const [phase, setPhase] = useState<Phase>("idle");
  const [micDenied, setMicDenied] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [audioCapturedAt, setAudioCapturedAt] = useState<string | undefined>(undefined);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  const project = session.selectedProject;
  const reportDate = todayIsoDate();

  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMicDenied(true); // photo + note fallback stays available
      return;
    }
    setMicDenied(false);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase("recording");
  };

  const pauseRecording = () => {
    recorder.pause();
    setPhase("paused");
  };

  const resumeRecording = () => {
    recorder.record();
    setPhase("recording");
  };

  const finishRecording = async () => {
    const duration = recorderState.durationMillis;
    await recorder.stop();
    if (recorder.uri) {
      setAudioUri(recorder.uri);
      setAudioDurationMs(duration);
      setAudioCapturedAt(isoNowWithOffset(new Date()));
      setPhase("recorded");
    } else {
      setPhase("idle");
    }
  };

  const discardRecording = () => {
    if (playerStatus.playing) player.pause();
    setAudioUri(null);
    setAudioDurationMs(0);
    setAudioCapturedAt(undefined);
    setPhase("idle");
  };

  const togglePlayback = () => {
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    if (playerStatus.didJustFinish || playerStatus.currentTime >= playerStatus.duration) {
      player.seekTo(0);
    }
    player.play();
  };

  const addAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const next = assets.map<PhotoDraft>((asset) => ({
      uri: asset.uri,
      contentType: asset.mimeType ?? "image/jpeg",
      // Preserve the EXIF timestamp when present; originals keep their GPS
      // data because bytes are uploaded unmodified (checksum-verified).
      ...(exifTimestampToIso(asset.exif, new Date())
        ? { capturedAt: exifTimestampToIso(asset.exif, new Date()) }
        : {}),
      hasLocation: exifHasLocation(asset.exif),
    }));
    setPhotos((existing) => [...existing, ...next]);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraDenied(true);
      return;
    }
    setCameraDenied(false);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      exif: true,
    });
    if (!result.canceled) addAssets(result.assets);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.85,
      exif: true,
    });
    if (!result.canceled) addAssets(result.assets);
  };

  const removePhoto = (uri: string) => {
    setPhotos((existing) => existing.filter((photo) => photo.uri !== uri));
  };

  /** Copies capture files into app-owned storage so drafts survive cache cleanup. */
  const persistFiles = (): CaptureAttachmentInput[] => {
    if (!audioUri) throw new Error(t("capture.needAudio"));
    const captureId = Crypto.randomUUID();
    const directory = new Directory(Paths.document, "captures", captureId);
    directory.create({ intermediates: true, idempotent: true });

    const copyIn = (sourceUri: string, name: string): string => {
      const destination = new File(directory, name);
      new File(sourceUri).copy(destination);
      return destination.uri;
    };

    const attachments: CaptureAttachmentInput[] = [
      {
        kind: "audio",
        fileUri: copyIn(audioUri, `update${audioUri.endsWith(".wav") ? ".wav" : ".m4a"}`),
        contentType: "audio/mp4",
        ...(audioCapturedAt ? { capturedAt: audioCapturedAt } : {}),
      },
    ];
    photos.forEach((photo, index) => {
      const extension = photo.contentType === "image/png" ? ".png" : ".jpg";
      attachments.push({
        kind: "photo",
        fileUri: copyIn(photo.uri, `photo-${index + 1}${extension}`),
        contentType: photo.contentType,
        ...(photo.capturedAt ? { capturedAt: photo.capturedAt } : {}),
      });
    });
    return attachments;
  };

  const save = async (submit: boolean) => {
    if (!project) return;
    if (!audioUri) {
      setFormError(t("capture.needAudio"));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const input = {
        projectId: project.id,
        reportDate,
        ...(note.trim() ? { note: note.trim() } : {}),
        attachments: persistFiles(),
      };
      // Durable local commit is the ack; sync happens in the background.
      if (submit) await submitCapture(input);
      else await saveDraft(input);
      router.back();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  const timerMillis = phase === "recorded" ? audioDurationMs : recorderState.durationMillis;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={26} color={colors.surface} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {t("capture.title")}
        </Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Recording block */}
        <Card style={styles.recordCard}>
          <Text
            accessibilityLabel={`${t(
              phase === "recording"
                ? "capture.recording"
                : phase === "paused"
                  ? "capture.paused"
                  : "capture.title",
            )} ${formatTimer(timerMillis)}`}
            style={styles.timer}
          >
            {formatTimer(timerMillis)}
          </Text>
          {phase === "recording" || phase === "paused" ? (
            <SupportingText style={styles.recordState}>
              {phase === "recording" ? t("capture.recording") : t("capture.paused")}
            </SupportingText>
          ) : null}

          {/* Prompt chips are reminders, not required sections. */}
          {phase !== "recorded" ? (
            <View style={styles.promptChips}>
              {(
                [
                  "capture.chip.work",
                  "capture.chip.labour",
                  "capture.chip.materials",
                  "capture.chip.blockers",
                  "capture.chip.tomorrow",
                ] as const
              ).map((key) => (
                <View key={key} style={styles.promptChip}>
                  <Text style={styles.promptChipText}>{t(key)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {micDenied ? (
            <View style={styles.noticeWarning}>
              <SupportingText style={{ color: colors.warning700 }}>
                {t("capture.micDenied")}
              </SupportingText>
            </View>
          ) : null}

          {phase === "idle" ? (
            <PrimaryButton
              accent
              icon={<Ionicons name="mic" size={24} color={colors.surface} />}
              label={t("capture.start")}
              onPress={() => void startRecording()}
            />
          ) : null}
          {phase === "recording" ? (
            <View style={styles.recordControls}>
              <SecondaryButton label={t("capture.pause")} onPress={pauseRecording} style={styles.flexGrow} />
              <PrimaryButton
                accent
                label={t("capture.finish")}
                onPress={() => void finishRecording()}
                style={styles.flexGrow}
              />
            </View>
          ) : null}
          {phase === "paused" ? (
            <View style={styles.recordControls}>
              <SecondaryButton label={t("capture.resume")} onPress={resumeRecording} style={styles.flexGrow} />
              <PrimaryButton
                accent
                label={t("capture.finish")}
                onPress={() => void finishRecording()}
                style={styles.flexGrow}
              />
            </View>
          ) : null}
          {phase === "recorded" ? (
            <View style={styles.recordControls}>
              <SecondaryButton
                label={playerStatus.playing ? t("capture.stop") : t("capture.play")}
                onPress={togglePlayback}
                style={styles.flexGrow}
              />
              <SecondaryButton
                label={t("capture.reRecord")}
                onPress={discardRecording}
                style={styles.flexGrow}
              />
            </View>
          ) : null}

          <SupportingText>{t("capture.audioLocal")}</SupportingText>
        </Card>

        {/* Photos */}
        <Card>
          <BodyText strong>{t("capture.addPhotos")}</BodyText>
          {photos.length > 0 ? (
            <>
              <SupportingText>
                {photos.length === 1
                  ? t("capture.photoCountOne")
                  : t("capture.photoCount", { count: photos.length })}
              </SupportingText>
              <ScrollView horizontal contentContainerStyle={styles.photoRail}>
                {photos.map((photo) => (
                  <View key={photo.uri} style={styles.photoWrap}>
                    <Image
                      accessibilityIgnoresInvertColors
                      source={{ uri: photo.uri }}
                      style={styles.photoThumb}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("capture.removePhoto")}
                      onPress={() => removePhoto(photo.uri)}
                      style={styles.photoRemove}
                    >
                      <Ionicons name="close" size={16} color={colors.surface} />
                    </Pressable>
                    <SupportingText style={styles.photoMeta}>
                      {photo.hasLocation ? t("capture.photoLocation") : t("capture.photoNoLocation")}
                    </SupportingText>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
          {cameraDenied ? (
            <View style={styles.noticeWarning}>
              <SupportingText style={{ color: colors.warning700 }}>
                {t("capture.cameraDenied")}
              </SupportingText>
            </View>
          ) : null}
          <View style={styles.recordControls}>
            <SecondaryButton
              label={t("capture.takePhoto")}
              onPress={() => void takePhoto()}
              style={styles.flexGrow}
            />
            <SecondaryButton
              label={t("capture.fromGallery")}
              onPress={() => void pickFromGallery()}
              style={styles.flexGrow}
            />
          </View>
        </Card>

        {/* Note + confirmation */}
        <Card>
          <BodyText strong nativeID="capture-note-label">
            {t("capture.notePlaceholder")}
          </BodyText>
          <TextInput
            accessibilityLabelledBy="capture-note-label"
            editable={!busy}
            maxLength={2000}
            multiline
            onChangeText={setNote}
            style={styles.noteInput}
            value={note}
          />
          <View style={styles.confirmRow}>
            <SupportingText>{t("capture.project")}</SupportingText>
            <BodyText strong>{project?.name ?? t("today.noProject")}</BodyText>
          </View>
          <View style={styles.confirmRow}>
            <SupportingText>{t("capture.date")}</SupportingText>
            <BodyText strong>{reportDate}</BodyText>
          </View>
        </Card>

        {formError ? (
          <View accessibilityLiveRegion="polite" style={styles.noticeError}>
            <BodyText style={{ color: colors.danger700 }}>{formError}</BodyText>
          </View>
        ) : null}

        <PrimaryButton
          busy={busy}
          disabled={!audioUri || !project}
          label={busy ? t("capture.saving") : t("capture.submit")}
          onPress={() => void save(true)}
        />
        <SecondaryButton
          disabled={busy || !audioUri || !project}
          label={t("capture.saveLater")}
          onPress={() => void save(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brand900 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2),
    backgroundColor: colors.brand900,
  },
  headerTitle: { color: colors.surface, fontSize: 18, lineHeight: 26, fontWeight: "600" },
  closeButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    padding: spacing(4),
    gap: spacing(4),
    backgroundColor: colors.neutral50,
    flexGrow: 1,
  },
  recordCard: { alignItems: "stretch", gap: spacing(3) },
  timer: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "700",
    color: colors.neutral950,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  recordState: { textAlign: "center", color: colors.accent600, fontWeight: "600" },
  promptChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(2),
    justifyContent: "center",
  },
  promptChip: {
    backgroundColor: colors.brand100,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  promptChipText: { color: colors.brand700, fontSize: 14, lineHeight: 20 },
  recordControls: { flexDirection: "row", gap: spacing(3) },
  flexGrow: { flex: 1 },
  noticeWarning: {
    backgroundColor: colors.warning100,
    borderRadius: radius.control,
    padding: spacing(3),
  },
  noticeError: {
    backgroundColor: colors.danger100,
    borderRadius: radius.control,
    padding: spacing(3),
  },
  photoRail: { gap: spacing(3), paddingVertical: spacing(2) },
  photoWrap: { width: 112, gap: spacing(1) },
  photoThumb: {
    width: 112,
    height: 112,
    borderRadius: radius.control,
    backgroundColor: colors.neutral200,
  },
  photoRemove: {
    position: "absolute",
    top: spacing(1),
    right: spacing(1),
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.neutral950,
    alignItems: "center",
    justifyContent: "center",
  },
  photoMeta: { fontSize: 12, lineHeight: 16, color: colors.neutral500 },
  noteInput: {
    minHeight: TOUCH_TARGET * 1.5,
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.control,
    padding: spacing(3),
    fontSize: 16,
    lineHeight: 22,
    color: colors.neutral950,
    textAlignVertical: "top",
  },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
    marginTop: spacing(1),
  },
});
