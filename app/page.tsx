import Image from "next/image";
import BrandLogo from "./components/BrandLogo";
import LandingCarousel from "./components/LandingCarousel";
import { AuthTransitionLink } from "./components/AuthTransition";

export default function Home() {
  const benefits = [
    {
      image: "/landing-listening.svg",
      alt: "Tai nghe với sóng âm thanh",
      eyebrow: "01 · Tập trung",
      title: "Lắng nghe chủ động",
      description:
        "Dành trọn sự chú ý cho từng âm và từng chi tiết trong bài nghe.",
    },
    {
      image: "/landing-progress.svg",
      alt: "Biểu đồ mô tả tiến trình tăng dần",
      eyebrow: "02 · Theo dõi",
      title: "Nhìn thấy tiến bộ",
      description:
        "Xem lại kết quả từng bài và nhận biết hành trình của chính bạn.",
    },
    {
      image: "/landing-feedback.svg",
      alt: "Phiếu bài tập với câu trả lời được đánh dấu",
      eyebrow: "03 · Phản hồi",
      title: "Học từ từng câu trả lời",
      description:
        "Đối chiếu đáp án sau khi nộp để biết mình cần luyện thêm điều gì.",
    },
  ];

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <div className="landing-header-inner">
          <BrandLogo href="/" />
          <nav className="landing-nav" aria-label="Tài khoản">
            <AuthTransitionLink href="/login" className="landing-login-link">
              Đăng nhập
            </AuthTransitionLink>
            <AuthTransitionLink
              href="/register"
              className="button landing-register-button"
            >
              Đăng ký
            </AuthTransitionLink>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-inner">
            <span className="landing-eyebrow">Không gian luyện nghe</span>
            <h1 id="landing-title" className="landing-heading">
              Luyện nghe, theo cách của bạn.
            </h1>
            <p className="landing-intro">
              Tập trung vào từng bài. Theo dõi từng bước tiến.
            </p>
            <LandingCarousel />
            <a className="landing-scroll-link" href="#loi-ich">
              Khám phá không gian học tập <span aria-hidden="true">↓</span>
            </a>
          </div>
        </section>

        <section className="landing-benefits" id="loi-ich">
          <div className="landing-benefits-inner">
            <div className="landing-section-heading">
              <span className="eyebrow">Luyện tập có mục tiêu</span>
              <h2>Mỗi lần nghe đều có ý nghĩa.</h2>
            </div>
            <div className="landing-feature-grid">
              {benefits.map((benefit) => (
                <article className="landing-feature-card" key={benefit.title}>
                  <div className="landing-feature-image">
                    <Image
                      src={benefit.image}
                      alt={benefit.alt}
                      width={720}
                      height={320}
                      sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 33vw"
                    />
                  </div>
                  <div className="landing-feature-copy">
                    <span>{benefit.eyebrow}</span>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <BrandLogo name="Dictation Studio" kicker="LISTEN · LEARN" />
            <p>Không gian luyện nghe và theo dõi hành trình học tập.</p>
          </div>
          <div className="landing-contact">
            <span className="landing-contact-heading">Thông tin liên hệ</span>
            <span>Email · sẽ cập nhật</span>
            <span>Zalo / Facebook · sẽ cập nhật</span>
            <span>Địa chỉ · sẽ cập nhật</span>
          </div>
          <p className="landing-copyright">
            © {new Date().getFullYear()} Dictation Studio
          </p>
        </div>
      </footer>
    </div>
  );
}
