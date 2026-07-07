import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBp-JwDIaXrcQOcAg7I96oS7OwSQtn_iB4",
  authDomain: "mahitha-cc-chatbot.firebaseapp.com",
  projectId: "mahitha-cc-chatbot",
  storageBucket: "mahitha-cc-chatbot.firebasestorage.app",
  messagingSenderId: "468327480284",
  appId: "1:468327480284:web:70f04034cc48262f102d19",
  measurementId: "G-CN21F3YNXY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();