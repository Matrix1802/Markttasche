// ============================================================
//  firebase.ts – Firebase Konfiguration
//
//  ① Gehe zu https://console.firebase.google.com
//  ② Neues Projekt erstellen (z.B. "markttasche")
//  ③ "Firestore Database" aktivieren → "Im Testmodus starten"
//  ④ Projekteinstellungen → "Web-App hinzufügen" → Config kopieren
//  ⑤ Die Werte unten ersetzen
// ============================================================

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAz7jKW9Wq428KALqc5UCtWpj67HSewYRw",
  authDomain: "einkaufsliste-82ade.firebaseapp.com",
  projectId: "einkaufsliste-82ade",
  storageBucket: "einkaufsliste-82ade.firebasestorage.app",
  messagingSenderId: "593581985079",
  appId: "1:593581985079:web:6442a37d076f5647585eb2"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
