import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBvh65f_HvFMwWNmyVZYriXZNev0xhDFYw",
  authDomain: "ccproject-b0f76.firebaseapp.com",
  projectId: "ccproject-b0f76",
  storageBucket: "ccproject-b0f76.firebasestorage.app",
  messagingSenderId: "467330627700",
  appId: "1:467330627700:web:6facfa2b389c006cf4b921",
  measurementId: "G-51F56WB139"
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); // This is the 'db' ChatInput is looking for!