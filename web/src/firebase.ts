import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, browserLocalPersistence, setPersistence, Auth } from "firebase/auth";
import { getStorage, FirebaseStorage } from "firebase/storage";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;

export const isFirebaseConfigured = Boolean(
  apiKey &&
  authDomain &&
  projectId &&
  appId &&
  apiKey !== "your_api_key" &&
  apiKey !== "..."
);

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length ? getApps()[0] : initializeApp({ apiKey, authDomain, projectId, appId });
    dbInstance = getFirestore(app);
    authInstance = getAuth(app);
    storageInstance = getStorage(app);
    setPersistence(authInstance, browserLocalPersistence).catch(() => {});
  } catch (err) {
    console.warn("Firebase initialization skipped or failed:", err);
  }
}

export const db = dbInstance as unknown as Firestore;
export const auth = authInstance as unknown as Auth;
export const storage = storageInstance as unknown as FirebaseStorage;

