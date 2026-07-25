// English + Hindi UI strings (design.md §18–§19) and a small t() hook.
// Pure TypeScript + React — no react-native/expo imports, so this module can
// load under node. Language persistence is injected by the provider's
// onLanguageChange callback (stored in SQLite app settings).

import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Language = "en" | "hi";

const en = {
  "app.name": "BuildFlow",
  "common.ok": "OK",
  "common.cancel": "Cancel",
  "common.retry": "Try again",
  "common.loading": "Loading…",
  "common.offline": "Offline — your work is safe on this device.",
  "common.offlineShort": "Offline",
  "common.online": "Connected",

  "signIn.eyebrow": "FIELD OPERATIONS",
  "signIn.title": "Sign in",
  "signIn.subtitle": "Site reporting that keeps working when the network doesn't.",
  "signIn.workspaceNote": "Voice, photos and daily records in one secure workspace.",
  "signIn.email": "Email",
  "signIn.password": "Password",
  "signIn.showPassword": "Show password",
  "signIn.hidePassword": "Hide password",
  "signIn.submit": "Sign in",
  "signIn.signingIn": "Signing in…",
  "signIn.invalid": "Email or password didn't match. Check and try again.",
  "signIn.offline": "You're offline. Connect to the network to sign in.",
  "signIn.unreachable": "Couldn't reach the server. Check the connection and try again.",
  "signIn.missingFields": "Enter your email and password.",

  "today.title": "Today",
  "today.fieldWorkspace": "Field workspace",
  "today.siteRecord": "Today's site record",
  "today.project": "Project",
  "today.recordUpdate": "Record update",
  "today.captureHint": "Voice + site photos · works offline",
  "today.noProject": "No project assigned yet. Ask your manager for access.",
  "today.reportPending": "Today's report hasn't been recorded yet.",
  "today.reportStarted": "Today's update is on its way.",
  "today.onThisDevice": "On this device",
  "today.filesProgress": "{done} of {total} files uploaded",
  "today.sessionExpired": "Your session expired. Sign in again to continue syncing.",
  "today.signInAgain": "Sign in again",
  "today.allSynced": "All updates are synced.",
  "today.syncQueue": "{count} sync actions pending",
  "today.localWork": "{count} updates in progress",
  "today.noPendingSync": "Everything on this device is up to date.",
  "today.submitDraft": "Submit",

  "status.savedOnDevice": "Saved on this device",
  "status.waitingForNetwork": "Waiting for network",
  "status.uploadingFiles": "Uploading {current} of {total} files",
  "status.uploadComplete": "Upload complete",
  "status.preparingReport": "Preparing report",
  "status.readyForReview": "Ready for manager review",
  "status.changesRequested": "Changes requested",
  "status.approved": "Approved",
  "status.issued": "Report issued",
  "status.superseded": "Superseded",
  "status.processingFailed": "Couldn't finish processing",
  "status.needsAttention": "Needs attention",
  "status.dataSafe": "Your audio and photos are safe on this device.",

  "capture.title": "Record update",
  "capture.contextLabel": "TODAY'S UPDATE",
  "capture.voiceStep": "Voice update",
  "capture.voiceStepHelp": "Describe completed work, labour, materials, blockers and tomorrow's plan.",
  "capture.evidenceStep": "Site evidence",
  "capture.evidenceStepHelp": "Attach clear photos already captured on site or take new ones.",
  "capture.detailsStep": "Final details",
  "capture.detailsStepHelp": "Confirm the project and add any context your manager should see.",
  "capture.start": "Start recording",
  "capture.recording": "Recording",
  "capture.paused": "Paused",
  "capture.pause": "Pause",
  "capture.resume": "Resume",
  "capture.finish": "Finish",
  "capture.reRecord": "Record again",
  "capture.play": "Play",
  "capture.stop": "Stop",
  "capture.audioLocal": "Audio stays on this device until it uploads.",
  "capture.micDenied":
    "Microphone permission is required for an update. You can prepare photos and a note, then allow access to record.",
  "capture.chip.work": "Work completed",
  "capture.chip.labour": "Labour",
  "capture.chip.materials": "Materials",
  "capture.chip.blockers": "Blockers",
  "capture.chip.tomorrow": "Tomorrow",
  "capture.addPhotos": "Add photos",
  "capture.photoEmpty": "No photos attached yet.",
  "capture.takePhoto": "Take photo",
  "capture.fromGallery": "From gallery",
  "capture.photoCount": "{count} photos",
  "capture.photoCountOne": "1 photo",
  "capture.photoLocation": "Location recorded",
  "capture.photoNoLocation": "No location metadata",
  "capture.removePhoto": "Remove photo",
  "capture.notePlaceholder": "Add a short note (optional)",
  "capture.noteHint": "Example: delayed concrete arrival affected the afternoon pour.",
  "capture.characters": "{count}/2000",
  "capture.project": "Project",
  "capture.date": "Date",
  "capture.submit": "Submit update",
  "capture.saveLater": "Save and finish later",
  "capture.saving": "Saving…",
  "capture.needAudio": "Record a voice update before submitting.",
  "capture.ready": "Ready to review",
  "capture.recordError": "Recording couldn't start. Check microphone access and try again.",
  "capture.photoError": "That photo couldn't be added. Try the camera or gallery again.",
  "capture.saveError":
    "Couldn't save this update. Your recording and photos are still on this screen. Try again.",
  "capture.discardTitle": "Discard this update?",
  "capture.discardBody": "The recording, photos and note on this screen have not been saved.",
  "capture.discard": "Discard update",
  "capture.cameraDenied": "Camera permission is needed to take photos. You can pick from the gallery instead.",

  "reports.title": "Reports",
  "reports.heading": "Site records",
  "reports.subtitle": "Submitted reports and work still safe on this device.",
  "reports.filterAll": "All",
  "reports.filterAttention": "Needs attention",
  "reports.filterDevice": "On device",
  "reports.emptyTitle": "No site records yet",
  "reports.empty": "No reports yet. Record your first update from Today.",
  "reports.emptyFilter": "No records match this view.",
  "reports.onThisDevice": "On this device",
  "reports.fromServer": "Submitted",
  "reports.loadError": "Couldn't load reports from the server. Showing what's on this device.",
  "reports.loadMore": "Load more",

  "account.title": "Account",
  "account.heading": "Your workspace",
  "account.subtitle": "Profile, language and on-device storage.",
  "account.language": "Language",
  "account.english": "English",
  "account.hindi": "हिन्दी",
  "account.signOut": "Sign out",
  "account.signOutConfirmTitle": "Sign out?",
  "account.signOutConfirmBody":
    "Anything not yet uploaded stays safely on this device and resumes after you sign in.",
  "account.version": "App version",
  "account.deviceAndSync": "Device & sync",
  "account.pendingCount": "{count} actions waiting to sync",
  "account.noPending": "No pending sync actions",
  "account.product": "BuildFlow Field",
  "account.productDetail": "Offline-first evidence capture for your construction workspace.",
  "account.signedInAs": "Signed in as",
  "account.dangerZone": "Danger",
  "account.clearSynced": "Clear synced local data",
  "account.clearSyncedHelp":
    "Deletes audio and photos that finished uploading. Reports on the server are not affected.",
  "account.clearSyncedConfirmTitle": "Delete synced local files?",
  "account.clearSyncedConfirmBody": "Only fully-uploaded drafts are removed. This cannot be undone.",
  "account.clearing": "Clearing…",
  "account.clearSyncedError": "Local files couldn't be cleared. Nothing was deleted.",
  "account.clearSyncedDone": "{count} synced drafts removed.",
  "account.clearSyncedNone": "Nothing to clear — no fully synced drafts on this device.",
} as const;

export type MessageKey = keyof typeof en;

const hi: Record<MessageKey, string> = {
  "app.name": "BuildFlow",
  "common.ok": "ठीक है",
  "common.cancel": "रद्द करें",
  "common.retry": "फिर से कोशिश करें",
  "common.loading": "लोड हो रहा है…",
  "common.offline": "ऑफ़लाइन — आपका काम इस डिवाइस पर सुरक्षित है।",
  "common.offlineShort": "ऑफ़लाइन",
  "common.online": "कनेक्टेड",

  "signIn.eyebrow": "फील्ड ऑपरेशंस",
  "signIn.title": "साइन इन करें",
  "signIn.subtitle": "नेटवर्क न होने पर भी साइट रिपोर्टिंग चलती रहती है।",
  "signIn.workspaceNote": "आवाज़, फ़ोटो और दैनिक रिकॉर्ड — एक सुरक्षित वर्कस्पेस में।",
  "signIn.email": "ईमेल",
  "signIn.password": "पासवर्ड",
  "signIn.showPassword": "पासवर्ड दिखाएँ",
  "signIn.hidePassword": "पासवर्ड छिपाएँ",
  "signIn.submit": "साइन इन करें",
  "signIn.signingIn": "साइन इन हो रहा है…",
  "signIn.invalid": "ईमेल या पासवर्ड मेल नहीं खाया। जाँच कर फिर से कोशिश करें।",
  "signIn.offline": "आप ऑफ़लाइन हैं। साइन इन करने के लिए नेटवर्क से जुड़ें।",
  "signIn.unreachable": "सर्वर से संपर्क नहीं हो सका। कनेक्शन जाँचें और फिर से कोशिश करें।",
  "signIn.missingFields": "अपना ईमेल और पासवर्ड भरें।",

  "today.title": "आज",
  "today.fieldWorkspace": "फील्ड वर्कस्पेस",
  "today.siteRecord": "आज का साइट रिकॉर्ड",
  "today.project": "प्रोजेक्ट",
  "today.recordUpdate": "अपडेट रिकॉर्ड करें",
  "today.captureHint": "आवाज़ + साइट फ़ोटो · ऑफ़लाइन भी चलता है",
  "today.noProject": "अभी कोई प्रोजेक्ट नहीं मिला है। अपने मैनेजर से एक्सेस माँगें।",
  "today.reportPending": "आज की रिपोर्ट अभी रिकॉर्ड नहीं हुई है।",
  "today.reportStarted": "आज का अपडेट भेजा जा रहा है।",
  "today.onThisDevice": "इस डिवाइस पर",
  "today.filesProgress": "{total} में से {done} फ़ाइलें अपलोड हुईं",
  "today.sessionExpired": "आपका सत्र समाप्त हो गया। सिंक जारी रखने के लिए फिर से साइन इन करें।",
  "today.signInAgain": "फिर से साइन इन करें",
  "today.allSynced": "सभी अपडेट सिंक हो चुके हैं।",
  "today.syncQueue": "{count} सिंक कार्रवाई लंबित",
  "today.localWork": "{count} अपडेट जारी हैं",
  "today.noPendingSync": "इस डिवाइस पर सब कुछ अपडेट है।",
  "today.submitDraft": "भेजें",

  "status.savedOnDevice": "इस डिवाइस पर सहेजा गया",
  "status.waitingForNetwork": "नेटवर्क की प्रतीक्षा में",
  "status.uploadingFiles": "{total} में से {current} फ़ाइल अपलोड हो रही है",
  "status.uploadComplete": "अपलोड पूरा हुआ",
  "status.preparingReport": "रिपोर्ट तैयार हो रही है",
  "status.readyForReview": "मैनेजर की समीक्षा के लिए तैयार",
  "status.changesRequested": "बदलाव माँगे गए हैं",
  "status.approved": "स्वीकृत",
  "status.issued": "रिपोर्ट जारी हुई",
  "status.superseded": "नई प्रति से बदली गई",
  "status.processingFailed": "प्रोसेसिंग पूरी नहीं हो सकी",
  "status.needsAttention": "ध्यान देने की ज़रूरत है",
  "status.dataSafe": "आपकी ऑडियो और फ़ोटो इस डिवाइस पर सुरक्षित हैं।",

  "capture.title": "अपडेट रिकॉर्ड करें",
  "capture.contextLabel": "आज का अपडेट",
  "capture.voiceStep": "आवाज़ में अपडेट",
  "capture.voiceStepHelp": "पूरा काम, मज़दूर, सामग्री, रुकावटें और कल की योजना बताएँ।",
  "capture.evidenceStep": "साइट के प्रमाण",
  "capture.evidenceStepHelp": "साइट की साफ़ फ़ोटो जोड़ें या नई फ़ोटो खींचें।",
  "capture.detailsStep": "अंतिम जानकारी",
  "capture.detailsStepHelp": "प्रोजेक्ट की पुष्टि करें और मैनेजर के लिए ज़रूरी संदर्भ जोड़ें।",
  "capture.start": "रिकॉर्डिंग शुरू करें",
  "capture.recording": "रिकॉर्डिंग जारी है",
  "capture.paused": "रुका हुआ",
  "capture.pause": "रोकें",
  "capture.resume": "जारी रखें",
  "capture.finish": "समाप्त करें",
  "capture.reRecord": "फिर से रिकॉर्ड करें",
  "capture.play": "सुनें",
  "capture.stop": "रोकें",
  "capture.audioLocal": "ऑडियो अपलोड होने तक इसी डिवाइस पर रहता है।",
  "capture.micDenied":
    "अपडेट के लिए माइक्रोफ़ोन की अनुमति ज़रूरी है। फ़ोटो और नोट तैयार करें, फिर रिकॉर्ड करने की अनुमति दें।",
  "capture.chip.work": "पूरा हुआ काम",
  "capture.chip.labour": "मज़दूर",
  "capture.chip.materials": "सामग्री",
  "capture.chip.blockers": "रुकावटें",
  "capture.chip.tomorrow": "कल का काम",
  "capture.addPhotos": "फ़ोटो जोड़ें",
  "capture.photoEmpty": "अभी कोई फ़ोटो नहीं जोड़ी गई।",
  "capture.takePhoto": "फ़ोटो खींचें",
  "capture.fromGallery": "गैलरी से",
  "capture.photoCount": "{count} फ़ोटो",
  "capture.photoCountOne": "1 फ़ोटो",
  "capture.photoLocation": "लोकेशन दर्ज है",
  "capture.photoNoLocation": "लोकेशन मेटाडेटा नहीं है",
  "capture.removePhoto": "फ़ोटो हटाएँ",
  "capture.notePlaceholder": "छोटा नोट जोड़ें (वैकल्पिक)",
  "capture.noteHint": "उदाहरण: कंक्रीट देर से आने के कारण दोपहर की ढलाई प्रभावित हुई।",
  "capture.characters": "{count}/2000",
  "capture.project": "प्रोजेक्ट",
  "capture.date": "तारीख़",
  "capture.submit": "अपडेट भेजें",
  "capture.saveLater": "सहेजें, बाद में पूरा करें",
  "capture.saving": "सहेजा जा रहा है…",
  "capture.needAudio": "भेजने से पहले आवाज़ में अपडेट रिकॉर्ड करें।",
  "capture.ready": "जाँच के लिए तैयार",
  "capture.recordError": "रिकॉर्डिंग शुरू नहीं हो सकी। माइक्रोफ़ोन एक्सेस जाँचकर फिर कोशिश करें।",
  "capture.photoError": "फ़ोटो जोड़ी नहीं जा सकी। कैमरा या गैलरी से फिर कोशिश करें।",
  "capture.saveError":
    "यह अपडेट सहेजा नहीं जा सका। आपकी रिकॉर्डिंग और फ़ोटो अभी इसी स्क्रीन पर हैं। फिर से कोशिश करें।",
  "capture.discardTitle": "यह अपडेट हटाएँ?",
  "capture.discardBody": "इस स्क्रीन की रिकॉर्डिंग, फ़ोटो और नोट अभी सहेजे नहीं गए हैं।",
  "capture.discard": "अपडेट हटाएँ",
  "capture.cameraDenied":
    "फ़ोटो खींचने के लिए कैमरे की अनुमति चाहिए। आप गैलरी से भी चुन सकते हैं।",

  "reports.title": "रिपोर्टें",
  "reports.heading": "साइट रिकॉर्ड",
  "reports.subtitle": "भेजी गई रिपोर्टें और इस डिवाइस पर सुरक्षित काम।",
  "reports.filterAll": "सभी",
  "reports.filterAttention": "ध्यान ज़रूरी",
  "reports.filterDevice": "डिवाइस पर",
  "reports.emptyTitle": "अभी कोई साइट रिकॉर्ड नहीं",
  "reports.empty": "अभी कोई रिपोर्ट नहीं है। 'आज' से अपना पहला अपडेट रिकॉर्ड करें।",
  "reports.emptyFilter": "इस व्यू से मेल खाता कोई रिकॉर्ड नहीं है।",
  "reports.onThisDevice": "इस डिवाइस पर",
  "reports.fromServer": "भेजी जा चुकी",
  "reports.loadError": "सर्वर से रिपोर्टें नहीं मिल सकीं। इस डिवाइस पर मौजूद रिपोर्टें दिखाई जा रही हैं।",
  "reports.loadMore": "और देखें",

  "account.title": "खाता",
  "account.heading": "आपका वर्कस्पेस",
  "account.subtitle": "प्रोफ़ाइल, भाषा और डिवाइस स्टोरेज।",
  "account.language": "भाषा",
  "account.english": "English",
  "account.hindi": "हिन्दी",
  "account.signOut": "साइन आउट करें",
  "account.signOutConfirmTitle": "साइन आउट करें?",
  "account.signOutConfirmBody":
    "जो अभी अपलोड नहीं हुआ है वह इस डिवाइस पर सुरक्षित रहेगा और साइन इन करने पर फिर से सिंक होगा।",
  "account.version": "ऐप संस्करण",
  "account.deviceAndSync": "डिवाइस और सिंक",
  "account.pendingCount": "{count} कार्रवाई सिंक होने की प्रतीक्षा में",
  "account.noPending": "कोई सिंक कार्रवाई लंबित नहीं",
  "account.product": "BuildFlow Field",
  "account.productDetail": "आपके कंस्ट्रक्शन वर्कस्पेस के लिए ऑफ़लाइन प्रमाण कैप्चर।",
  "account.signedInAs": "साइन इन खाता",
  "account.dangerZone": "सावधानी",
  "account.clearSynced": "सिंक हो चुका लोकल डेटा हटाएँ",
  "account.clearSyncedHelp":
    "सिर्फ़ वही ऑडियो और फ़ोटो हटती हैं जिनका अपलोड पूरा हो चुका है। सर्वर की रिपोर्टों पर असर नहीं पड़ता।",
  "account.clearSyncedConfirmTitle": "सिंक हो चुकी लोकल फ़ाइलें हटाएँ?",
  "account.clearSyncedConfirmBody": "सिर्फ़ पूरी तरह अपलोड हो चुके ड्राफ़्ट हटेंगे। इसे वापस नहीं किया जा सकता।",
  "account.clearing": "हटाया जा रहा है…",
  "account.clearSyncedError": "लोकल फ़ाइलें हटाई नहीं जा सकीं। कुछ भी नहीं हटाया गया।",
  "account.clearSyncedDone": "{count} सिंक हो चुके ड्राफ़्ट हटाए गए।",
  "account.clearSyncedNone": "हटाने के लिए कुछ नहीं — इस डिवाइस पर कोई पूरी तरह सिंक हुआ ड्राफ़्ट नहीं है।",
};

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, hi };

export type MessageParams = Record<string, string | number>;

export function formatMessage(
  language: Language,
  key: MessageKey,
  params?: MessageParams,
): string {
  const template = dictionaries[language][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider(props: {
  initialLanguage: Language;
  onLanguageChange?: (language: Language) => void;
  children: ReactNode;
}) {
  const { initialLanguage, onLanguageChange, children } = props;
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      onLanguageChange?.(next);
    },
    [onLanguageChange],
  );

  const value = useMemo<I18n>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => formatMessage(language, key, params),
    }),
    [language, setLanguage],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error("useI18n must be used inside I18nProvider");
  return i18n;
}

export const LANGUAGE_SETTING_KEY = "ui.language";

export function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "hi";
}
