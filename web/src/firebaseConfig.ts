// Firebase's web configuration is public client metadata, not a server secret.
// Keep the known-good project values here so a GitHub Pages build does not
// silently lose Firestore/Auth access when a local .env file is absent.
export const fallbackFirebaseConfig = {
  apiKey: "AIzaSyB_Oa1LEbfXhxlHGBOAGZSYIqzdi4ro4uw",
  authDomain: "forbelle-d9825.firebaseapp.com",
  projectId: "forbelle-d9825",
  appId: "1:784086662063:web:b5f4276abbbd053e4d0d5a"
} as const;
