// Hier die Werte aus der Firebase Console eintragen:
// Projekteinstellungen → Allgemein → Meine Apps → Web-App → SDK-Konfiguration
export const firebaseConfig = {
  apiKey: "AIzaSyCrEMoTnxwfAOErOUY-SQsl0y4bBWnxqXs",
  authDomain: "kita-gs.firebaseapp.com",
  projectId: "kita-gs",
  storageBucket: "kita-gs.firebasestorage.app",
  messagingSenderId: "463405132582",
  appId: "1:463405132582:web:c6e03cc1b01f342e18afe7"
};

// Hausmeister melden sich nur mit Benutzernamen an.
// Intern wird daraus eine Login-Adresse: benutzername@LOGIN_DOMAIN
// (es wird nie eine Mail an diese Adresse geschickt).
export const LOGIN_DOMAIN = "reinigung-merzig.local";
