"use client";

import { useEffect, useState } from "react";

const slides = [
  {
    quote: "Mỗi bài nghe là một bước tiến.",
    note: "Bình tĩnh lắng nghe, tự tin hoàn thành từng câu.",
  },
  {
    quote: "Nghe kỹ hơn. Tiến bộ mỗi ngày.",
    note: "Tập trung vào từng chi tiết nhỏ trong đoạn hội thoại.",
  },
  {
    quote: "Một lần lắng nghe. Một cơ hội để bứt phá.",
    note: "Rèn sự tập trung và ghi nhận hành trình của chính bạn.",
  },
  {
    quote: "Tiến bộ bắt đầu từ sự chú tâm.",
    note: "Mỗi kết quả là một dấu mốc trên hành trình học tập.",
  },
];

export default function LandingCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const activeSlide = slides[activeIndex];

  useEffect(() => {
    if (paused) return;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [paused]);

  const move = (direction: number) => {
    setActiveIndex((index) => (index + direction + slides.length) % slides.length);
  };

  return (
    <div
      className="landing-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      aria-roledescription="carousel"
      aria-label="Thông điệp học tập"
    >
      <div className="landing-quote-stage" aria-live="polite" aria-atomic="true">
        <span className="landing-quote-index">
          {String(activeIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
        </span>
        <blockquote key={activeIndex} className="landing-quote">
          “{activeSlide.quote}”
        </blockquote>
        <p key={`note-${activeIndex}`} className="landing-quote-note">
          {activeSlide.note}
        </p>
      </div>

      <div className="landing-carousel-controls" aria-label="Điều khiển carousel">
        <button type="button" onClick={() => move(-1)} aria-label="Thông điệp trước">
          ←
        </button>
        <div className="landing-carousel-dots">
          {slides.map((slide, index) => (
            <button
              key={slide.quote}
              type="button"
              className={index === activeIndex ? "is-active" : ""}
              aria-label={`Hiện thông điệp ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
        <button type="button" onClick={() => move(1)} aria-label="Thông điệp tiếp theo">
          →
        </button>
      </div>
    </div>
  );
}
