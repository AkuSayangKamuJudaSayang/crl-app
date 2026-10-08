"use client";

import { useEffect, useState } from "react";

const slides = [
  { image: "/login-slides/classroom-1.webp", alt: "Filipino learners working together in a classroom" },
  { image: "/login-slides/classroom-2.webp", alt: "Young Filipino learners completing reading activities" },
  { image: "/login-slides/classroom-3.webp", alt: "Filipino learners participating in a classroom activity" },
];

export default function LoginSlideshow() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;
    function updateTimer() {
      window.clearInterval(timer);
      if (paused || document.hidden || motion.matches) return;
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
  }, [paused]);

  return (
    <aside className="visual-panel">
      <div className="visual-top">
        <img src="/deped-logo.png" alt="Department of Education seal" width="48" height="48" />
        <span>Comprehensive Rapid Literacy Assessment</span>
      </div>
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
        <div className="slide-controls" aria-label="Classroom slideshow controls">
          {slides.map((slide, index) => (
            <button key={slide.image} type="button" className="slide-dot" aria-label={`Show classroom photo ${index + 1}`} aria-pressed={index === activeSlide} onClick={() => { setActiveSlide(index); setPaused(true); }}>
              <span aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="slide-pause" onClick={() => setPaused(current => !current)} aria-label={paused ? "Play slideshow" : "Pause slideshow"} aria-pressed={paused}>
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </div>
    </aside>
  );
}
