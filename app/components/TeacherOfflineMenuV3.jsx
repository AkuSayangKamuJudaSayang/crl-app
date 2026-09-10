"use client";

import { useEffect } from "react";
import TeacherOfflineMenuV2 from "./TeacherOfflineMenuV2";

const HARMONY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACEklEQVR42nWTzUobURTHf+feaUgcizABjSBMuwhBpWCVWUZQ+rXuC7joQvoGXRWaSjVdCG5cZhHwAVwUyTJdxz5ClhGDK7tI7dyZ00VnJNPUC4fLOfee//n6HwEEUOAN0ARKme1/R4HfwHegN/3va/aoIjJz/2vLpJ07v8oMCeAeEhGZ1tPM54UBdqei22q1agEbBIEVEev7vq1UKlZVre/7dm5uzk4B7BrA5LWUSiUODw8BODg4oFwus7Ozw8XFBQD9fp8oigCw1gpgTF6HiOCcIwxDTk5O2NjYwDnH3d0d8/PznJ2doarEcVzoqnffXlU8z+P29pZWq8Xp6SnWWhYWFjg/P2c4HDIcDgmCYGY0+QSctVZXV1cV0Hq9rp7n6fLysq6srCigYRjq4uKiZk1V4KhQQpIk3NzcsL+/T5IkOOe4urpiMpmwt7dHHMeMx2NEBFWFrIGI/OXD0tISx8fHTCYTWq0W6+vriAjtdptms0mtVsMYc/+/AKCqNBoNrq/HdLtdLi9/sLm5iarS6XQYjUZEUXQfuQCQpilGhMFggBXHp48faNSf0Ov1ANja2iIIAtbW1lDVQgYAR0AqxjhAnz5/q+8/f9Nn2+8yyopWKhWNokiNMTmNczZ+kYzKvYyJaflxjVg9HknKr5+jmZSnMhfg5cwyPSRT0XM5IkPJ1/k1sI1ISTAoqVCMniuFdf4DQmHnqez0s+EAAAAASUVORK5CYII=";

export default function TeacherOfflineMenuV3() {
  useEffect(() => {
    const patchHarmony = () => {
      document.querySelectorAll(".crl-platform-button").forEach((button) => {
        if (String(button.textContent || "").replace(/\s+/g, " ").trim() !== "HarmonyOS") return;
        const image = button.querySelector(".crl-platform-icon");
        if (image) image.src = HARMONY_ICON;
      });
    };
    patchHarmony();
    const observer = new MutationObserver(patchHarmony);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <TeacherOfflineMenuV2 />;
}
