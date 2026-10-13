import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxZbBgIJqaYHpOc33iLF6tT3BQbTyoiH8",
  authDomain: "nsaai-platform-baf2d.firebaseapp.com",
  projectId: "nsaai-platform-baf2d",
  storageBucket: "nsaai-platform-baf2d.firebasestorage.app",
  messagingSenderId: "220676796548",
  appId: "1:220676796548:web:1373d3ce93e2375a0012d1",
  measurementId: "G-6TFQTL6J04"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);