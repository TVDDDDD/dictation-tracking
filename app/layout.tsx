import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif } from "next/font/google";
import { AuthTransitionProvider } from "./components/AuthTransition";
import "./globals.css";
import ThemeToggle from "./ThemeToggle";

// Apply theme đã lưu TRƯỚC render → không flash nền sáng khi reload ở dark mode
const themeScript = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.dataset.theme='dark';}}catch(e){}})()`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "vietnamese"],
});

const notoSerif = Noto_Serif({
  variable: "--font-display",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "Dictation Studio | Luyện nghe",
  description: "Nền tảng luyện nghe và theo dõi tiến độ học tập.",
  icons: {
    icon: "/dictation-mark.svg",
    shortcut: "/dictation-mark.svg",
    apple: "/dictation-mark.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AuthTransitionProvider>{children}</AuthTransitionProvider>
        <ThemeToggle />
      </body>
    </html>
  );
}
