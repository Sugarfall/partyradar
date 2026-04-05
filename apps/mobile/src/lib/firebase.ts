import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import Constants from 'expo-constants'

const {
  EXPO_PUBLIC_FIREBASE_API_KEY: apiKey,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: authDomain,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  EXPO_PUBLIC_FIREBASE_APP_ID: appId,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: messagingSenderId,
} = process.env

const app = getApps().length ? getApps()[0]! : initializeApp({ apiKey, authDomain, projectId, appId, messagingSenderId })
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, type User }
