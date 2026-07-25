// /capture — an offline-first field update with voice, evidence and context.
// Files are committed to durable local storage before background sync begins.

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
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { exifHasLocation, exifTimestampToIso, isoNowWithOffset } from "../src/lib/exif";
import { useI18n } from "../src/lib/i18n";
import type { CaptureAttachmentInput } from "../src/lib/sync/types";
import { useSession } from "../src/state/session";
import { useSync } from "../src/state/sync";
import {
  BodyText,
  IconButton,
  NoticeCard,
  PrimaryButton,
  SecondaryButton,
  SupportingText,
} from "../src/ui/components";
import {
  TOUCH_TARGET,
  colors,
  elevation,
  glass,
  layout,
  radius,
  spacing,
  typography,
} from "../src/ui/theme";

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
  useKeepAwake();
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
  const hasUnsavedWork = phase !== "idle" || photos.length > 0 || note.trim().length > 0;

  const confirmClose = useCallback(() => {
    if (busy) return;
    if (!hasUnsavedWork) {
      router.back();
      return;
    }
    Alert.alert(t("capture.discardTitle"), t("capture.discardBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("capture.discard"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (playerStatus.playing) player.pause();
            if (phase === "recording" || phase === "paused") {
              try {
                await recorder.stop();
              } catch {
                // The recorder may already have stopped while the dialog was open.
              }
            }
            router.back();
          })();
        },
      },
    ]);
  }, [busy, hasUnsavedWork, phase, player, playerStatus.playing, recorder, router, t]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      confirmClose();
      return true;
    });
    return () => subscription.remove();
  }, [confirmClose]);

  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    setFormError(null);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("recording");
    } catch {
      setPhase("idle");
      setFormError(t("capture.recordError"));
    }
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
    try {
      await recorder.stop();
      if (recorder.uri) {
        setAudioUri(recorder.uri);
        setAudioDurationMs(duration);
        setAudioCapturedAt(isoNowWithOffset(new Date()));
        setPhase("recorded");
      } else {
        setPhase("idle");
      }
    } catch {
      setPhase("idle");
      setFormError(t("capture.recordError"));
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
      ...(exifTimestampToIso(asset.exif, new Date())
        ? { capturedAt: exifTimestampToIso(asset.exif, new Date()) }
        : {}),
      hasLocation: exifHasLocation(asset.exif),
    }));
    setPhotos((existing) => [...existing, ...next]);
  };

  const takePhoto = async () => {
    try {
      setFormError(null);
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
    } catch {
      setFormError(t("capture.photoError"));
    }
  };

  const pickFromGallery = async () => {
    try {
      setFormError(null);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.85,
        exif: true,
      });
      if (!result.canceled) addAssets(result.assets);
    } catch {
      setFormError(t("capture.photoError"));
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((existing) => existing.filter((photo) => photo.uri !== uri));
  };

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
      if (submit) await submitCapture(input);
      else await saveDraft(input);
      router.back();
    } catch {
      setFormError(t("capture.saveError"));
      setBusy(false);
    }
  };

  const timerMillis = phase === "recorded" ? audioDurationMs : recorderState.durationMillis;
  const recordingState =
    phase === "recording"
      ? t("capture.recording")
      : phase === "paused"
        ? t("capture.paused")
        : phase === "recorded"
          ? t("capture.ready")
          : t("capture.start");

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <IconButton
          icon="close"
          label={t("common.cancel")}
          onPress={confirmClose}
          light
        />
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>{t("capture.contextLabel")}</Text>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>
            {t("capture.title")}
          </Text>
        </View>
        <View style={styles.headerBalance} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.contextBar}>
              <View style={styles.contextIcon}>
                <Ionicons name="business-outline" size={20} color={colors.brand800} />
              </View>
              <View style={styles.contextCopy}>
                <Text numberOfLines={1} style={styles.contextTitle}>
                  {project?.name ?? t("today.noProject")}
                </Text>
                <Text style={styles.contextMeta}>{reportDate}</Text>
              </View>
              <Ionicons name="lock-closed-outline" size={18} color={colors.neutral500} />
            </View>

            <View style={styles.voiceCard}>
              <View style={styles.stepHeader}>
                <View style={[styles.stepBadge, styles.stepBadgeDark]}>
                  <Text style={styles.stepBadgeDarkText}>01</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitleLight}>{t("capture.voiceStep")}</Text>
                  <Text style={styles.stepHelpLight}>{t("capture.voiceStepHelp")}</Text>
                </View>
              </View>

              <View style={styles.recordingStatus}>
                <View
                  style={[
                    styles.recordingDot,
                    phase === "recording" && styles.recordingDotActive,
                  ]}
                />
                <Text style={styles.recordingStatusText}>{recordingState}</Text>
              </View>
              <Text
                accessibilityLabel={`${recordingState} ${formatTimer(timerMillis)}`}
                style={styles.timer}
              >
                {formatTimer(timerMillis)}
              </Text>

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
                <NoticeCard
                  body={t("capture.micDenied")}
                  icon="mic-off-outline"
                  title={t("capture.voiceStep")}
                  tone="warning"
                />
              ) : null}

              {phase === "idle" ? (
                <PrimaryButton
                  accent
                  icon={<Ionicons name="mic" size={23} color={colors.surface} />}
                  label={t("capture.start")}
                  onPress={() => void startRecording()}
                />
              ) : null}
              {phase === "recording" || phase === "paused" ? (
                <View style={styles.controlRow}>
                  <SecondaryButton
                    icon={phase === "recording" ? "pause" : "play"}
                    label={phase === "recording" ? t("capture.pause") : t("capture.resume")}
                    onPress={phase === "recording" ? pauseRecording : resumeRecording}
                    style={styles.flexGrow}
                  />
                  <PrimaryButton
                    accent
                    icon={<Ionicons name="stop" size={20} color={colors.surface} />}
                    label={t("capture.finish")}
                    onPress={() => void finishRecording()}
                    style={styles.flexGrow}
                  />
                </View>
              ) : null}
              {phase === "recorded" ? (
                <View style={styles.controlRow}>
                  <SecondaryButton
                    icon={playerStatus.playing ? "pause" : "volume-high"}
                    label={playerStatus.playing ? t("capture.stop") : t("capture.play")}
                    onPress={togglePlayback}
                    style={styles.flexGrow}
                  />
                  <SecondaryButton
                    icon="refresh"
                    label={t("capture.reRecord")}
                    onPress={discardRecording}
                    style={styles.flexGrow}
                  />
                </View>
              ) : null}

              <View style={styles.localNote}>
                <Ionicons name="phone-portrait-outline" size={16} color={colors.neutral500} />
                <Text style={styles.localNoteText}>{t("capture.audioLocal")}</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>02</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{t("capture.evidenceStep")}</Text>
                  <Text style={styles.stepHelp}>{t("capture.evidenceStepHelp")}</Text>
                </View>
              </View>

              {photos.length > 0 ? (
                <>
                  <Text style={styles.photoCount}>
                    {photos.length === 1
                      ? t("capture.photoCountOne")
                      : t("capture.photoCount", { count: photos.length })}
                  </Text>
                  <ScrollView
                    horizontal
                    contentContainerStyle={styles.photoRail}
                    showsHorizontalScrollIndicator={false}
                  >
                    {photos.map((photo) => (
                      <View key={photo.uri} style={styles.photoWrap}>
                        <Image
                          accessibilityIgnoresInvertColors
                          source={{ uri: photo.uri }}
                          style={styles.photoThumb}
                        />
                        <Pressable
                          accessibilityLabel={t("capture.removePhoto")}
                          accessibilityRole="button"
                          android_ripple={{ color: colors.neutral700, borderless: true }}
                          hitSlop={8}
                          onPress={() => removePhoto(photo.uri)}
                          style={styles.photoRemove}
                        >
                          <Ionicons name="close" size={18} color={colors.surface} />
                        </Pressable>
                        <View style={styles.photoMetaRow}>
                          <Ionicons
                            name={photo.hasLocation ? "location" : "location-outline"}
                            size={13}
                            color={photo.hasLocation ? colors.success700 : colors.neutral500}
                          />
                          <Text numberOfLines={1} style={styles.photoMeta}>
                            {photo.hasLocation
                              ? t("capture.photoLocation")
                              : t("capture.photoNoLocation")}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <View style={styles.photoEmpty}>
                  <Ionicons name="images-outline" size={24} color={colors.neutral500} />
                  <SupportingText>{t("capture.photoEmpty")}</SupportingText>
                </View>
              )}

              {cameraDenied ? (
                <NoticeCard
                  body={t("capture.cameraDenied")}
                  icon="camera-outline"
                  title={t("capture.takePhoto")}
                  tone="warning"
                />
              ) : null}

              <View style={styles.evidenceActions}>
                <EvidenceAction
                  icon="camera"
                  label={t("capture.takePhoto")}
                  onPress={() => void takePhoto()}
                />
                <EvidenceAction
                  icon="images"
                  label={t("capture.fromGallery")}
                  onPress={() => void pickFromGallery()}
                />
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>03</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{t("capture.detailsStep")}</Text>
                  <Text style={styles.stepHelp}>{t("capture.detailsStepHelp")}</Text>
                </View>
              </View>

              <View style={styles.detailsPanel}>
                <View style={styles.detailRow}>
                  <SupportingText>{t("capture.project")}</SupportingText>
                  <Text numberOfLines={1} style={styles.detailValue}>
                    {project?.name ?? t("today.noProject")}
                  </Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <SupportingText>{t("capture.date")}</SupportingText>
                  <BodyText strong>{reportDate}</BodyText>
                </View>
              </View>

              <View>
                <View style={styles.inputLabelRow}>
                  <BodyText nativeID="capture-note-label" strong>
                    {t("capture.notePlaceholder")}
                  </BodyText>
                  <SupportingText>{t("capture.characters", { count: note.length })}</SupportingText>
                </View>
                <TextInput
                  accessibilityLabelledBy="capture-note-label"
                  editable={!busy}
                  maxLength={2000}
                  multiline
                  onChangeText={setNote}
                  placeholder={t("capture.noteHint")}
                  placeholderTextColor={colors.neutral500}
                  style={styles.noteInput}
                  textAlignVertical="top"
                  value={note}
                />
              </View>
            </View>

            {formError ? (
              <NoticeCard body={formError} icon="alert-circle-outline" tone="danger" />
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.actionDock}>
          <PrimaryButton
            busy={busy}
            disabled={!audioUri || !project}
            icon={<Ionicons name="arrow-up-circle" size={22} color={colors.surface} />}
            label={busy ? t("capture.saving") : t("capture.submit")}
            onPress={() => void save(true)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !audioUri || !project }}
            android_ripple={{ color: colors.brand100 }}
            disabled={busy || !audioUri || !project}
            onPress={() => void save(false)}
            style={({ pressed }) => [
              styles.saveLaterButton,
              pressed && styles.saveLaterPressed,
              (busy || !audioUri || !project) && styles.saveLaterDisabled,
            ]}
          >
            <Ionicons name="download-outline" size={19} color={colors.brand800} />
            <Text style={styles.saveLaterText}>{t("capture.saveLater")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EvidenceAction({
  icon,
  label,
  onPress,
}: {
  icon: "camera" | "images";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      android_ripple={{ color: colors.brand100 }}
      onPress={onPress}
      style={({ pressed }) => [styles.evidenceAction, pressed && styles.evidenceActionPressed]}
    >
      <View style={styles.evidenceIcon}>
        <Ionicons name={icon} size={22} color={colors.brand800} />
      </View>
      <Text style={styles.evidenceLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.brand950 },
  header: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.horizontal,
    paddingVertical: spacing(1),
    backgroundColor: colors.brand950,
  },
  headerCopy: { flex: 1, paddingHorizontal: spacing(2) },
  headerEyebrow: {
    ...typography.overline,
    color: colors.accent600,
    marginBottom: 2,
  },
  headerTitle: { ...typography.cardTitle, color: colors.surface },
  headerBalance: { width: TOUCH_TARGET, height: TOUCH_TARGET },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.paper,
    paddingBottom: spacing(5),
  },
  content: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    padding: layout.horizontal,
    gap: spacing(4),
  },
  contextBar: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
  },
  contextIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.compact,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand50,
  },
  contextCopy: { flex: 1, minWidth: 0 },
  contextTitle: { ...typography.bodyStrong, color: colors.neutral950 },
  contextMeta: { ...typography.caption, color: colors.neutral500, marginTop: 1 },
  voiceCard: {
    padding: spacing(4),
    gap: spacing(4),
    borderRadius: radius.card,
    backgroundColor: colors.brand950,
    ...elevation.raised,
  },
  sectionCard: {
    padding: spacing(4),
    gap: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...elevation.subtle,
  },
  stepHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing(3) },
  stepBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand50,
  },
  stepBadgeDark: { backgroundColor: glass.onDark },
  stepBadgeText: { ...typography.label, color: colors.brand800 },
  stepBadgeDarkText: { ...typography.label, color: colors.accent600 },
  stepCopy: { flex: 1, minWidth: 0 },
  stepTitle: { ...typography.cardTitle, color: colors.neutral950 },
  stepTitleLight: { ...typography.cardTitle, color: colors.surface },
  stepHelp: { ...typography.body, color: colors.neutral600, marginTop: spacing(0.5) },
  stepHelpLight: { ...typography.body, color: colors.neutral300, marginTop: spacing(0.5) },
  recordingStatus: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
    backgroundColor: glass.onDark,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral500,
  },
  recordingDotActive: { backgroundColor: colors.danger700 },
  recordingStatusText: { ...typography.label, color: colors.neutral200 },
  timer: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: "700",
    letterSpacing: -1.5,
    color: colors.surface,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  promptChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(2),
    justifyContent: "center",
  },
  promptChip: {
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.25),
    backgroundColor: glass.onDark,
  },
  promptChipText: { ...typography.caption, color: colors.neutral200 },
  controlRow: { flexDirection: "row", gap: spacing(2) },
  flexGrow: { flex: 1 },
  localNote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing(1.5),
  },
  localNoteText: { ...typography.caption, color: colors.neutral500, flexShrink: 1 },
  photoCount: { ...typography.label, color: colors.brand800 },
  photoRail: { gap: spacing(3), paddingVertical: spacing(1) },
  photoWrap: { width: 132, gap: spacing(1.5) },
  photoThumb: {
    width: 132,
    height: 116,
    borderRadius: radius.control,
    backgroundColor: colors.neutral200,
  },
  photoRemove: {
    position: "absolute",
    top: spacing(1),
    right: spacing(1),
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutral950,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoMetaRow: { flexDirection: "row", alignItems: "center", gap: spacing(0.5) },
  photoMeta: { ...typography.caption, color: colors.neutral500, flex: 1 },
  photoEmpty: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    padding: spacing(3),
    borderRadius: radius.control,
    backgroundColor: colors.neutral50,
  },
  evidenceActions: { flexDirection: "row", gap: spacing(2) },
  evidenceAction: {
    flex: 1,
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(1.5),
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  evidenceActionPressed: { backgroundColor: colors.brand50 },
  evidenceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand50,
  },
  evidenceLabel: { ...typography.label, color: colors.brand900, textAlign: "center" },
  detailsPanel: {
    paddingHorizontal: spacing(3),
    borderRadius: radius.control,
    backgroundColor: colors.neutral50,
  },
  detailRow: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
  },
  detailValue: { ...typography.bodyStrong, color: colors.neutral950, flex: 1, textAlign: "right" },
  detailDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.neutral200 },
  inputLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2),
    marginBottom: spacing(2),
  },
  noteInput: {
    minHeight: 128,
    borderWidth: 1,
    borderColor: colors.neutral300,
    borderRadius: radius.control,
    padding: spacing(3),
    fontSize: 16,
    lineHeight: 23,
    color: colors.neutral950,
    backgroundColor: colors.surface,
  },
  actionDock: {
    gap: spacing(1),
    paddingHorizontal: layout.horizontal,
    paddingTop: spacing(2),
    paddingBottom: spacing(1),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.neutral200,
    backgroundColor: colors.surface,
    ...elevation.floating,
  },
  saveLaterButton: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    borderRadius: radius.control,
    overflow: "hidden",
  },
  saveLaterPressed: { backgroundColor: colors.brand50 },
  saveLaterDisabled: { opacity: 0.42 },
  saveLaterText: { ...typography.bodyStrong, color: colors.brand800 },
});
