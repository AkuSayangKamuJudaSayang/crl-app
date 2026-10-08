"use client";

import { useEffect, useState } from "react";

const slides = [
  { image: "/login-slides/classroom-1.webp", alt: "Filipino learners working together in a classroom" },
  { image: "/login-slides/classroom-2.webp", alt: "Young Filipino learners completing reading activities" },
  { image: "/login-slides/classroom-3.webp", alt: "Filipino learners participating in a classroom activity" },
];

export default function LoginSlideshow() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;
    function updateTimer() {
      window.clearInterval(timer);
      if (document.hidden || motion.matches) return;
      timer = window.setInterval(() => {
        setActiveSlide(current => (current + 1) % slides.length);
      }, 5500);
    }
    updateTimer();
    document.addEventListener("visibilitychange", updateTimer);
    motion.addEventListener("change", updateTimer);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateTimer);
      motion.removeEventListener("change", updateTimer);
    };
  }, []);

  return (
    <aside className="visual-panel">
      <div className="photo-stage" role="region" aria-roledescription="carousel" aria-label="Classroom photos">
        {slides.map((slide, index) => (
          <div key={slide.image} className={`photo-slide ${index === activeSlide ? "active" : ""}`} aria-hidden={index !== activeSlide}>
            <img src={slide.image} alt={slide.alt} width="1100" height="825" decoding="async" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "low"} />
          </div>
        ))}
      </div>
      <div className="visual-bottom">
        <div className="visual-copy">
          <h2>Every learner.<br />A step forward.</h2>
          <p>A clearer picture of every reading journey.</p>
        </div>
      </div>
    </aside>
  );
}
