import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";
import HealthCheckButton from "./HealthCheckButton";

type Incident = {
  code: string;
  title: string;
  symptom: string;
  steps: string[];
  escalate: string;
};

const incidents: Incident[] = [
  {
    code: "1",
    title: "Mở site không được (trang trắng, lỗi, không vào được)",
    symptom: "Trang successful-listening.online không tải, hoặc hiện lỗi.",
    steps: [
      "Kiểm tra Wi-Fi/mạng của bạn: mở trang khác (google.com) thử — nếu cũng không ra thì chỉ là mạng nhà bạn.",
      "Mạng bình thường mà site vẫn mở không được → bên hosting đang sập, KHÔNG thuộc việc của bạn.",
    ],
    escalate:
      "Báo dev ngay: ghi rõ giờ + chụp màn hình trang lỗi. Không cần làm gì thêm trong lúc chờ.",
  },
  {
    code: "2",
    title: "Site mở được nhưng đăng nhập / làm bài báo lỗi",
    symptom: "Trang tải bình thường nhưng SV báo không đăng nhập được, hoặc làm bài thì báo lỗi.",
    steps: [
      "Bấm nút \"🩺 Kiểm tra hệ thống\" ở trên. Nếu hiện \"database không kết nối\" → DB đang sập, báo dev ngay.",
      "Nếu kiểm tra bình thường: yêu cầu SV thử lại (đăng xuất → đăng nhập lại).",
      "Vẫn lỗi → hỏi SV chụp màn hình, tra mục 8 (Không rõ lỗi).",
    ],
    escalate: "Báo dev: giờ + triệu chứng + ảnh chụp màn hình của SV.",
  },
  {
    code: "3",
    title: "SV báo \"không thấy bài\" hoặc bài hiển thị \"Chưa mở\"",
    symptom: "Bài đã tạo nhưng SV của lớp không thấy, hoặc badge \"Chưa mở\".",
    steps: [
      "Vào trang Admin → bảng \"Mở/đóng bài theo lớp\" → chọn lớp đó → kiểm tra bài có hiện \"✓ Mở\" không. Chưa → bấm Mở.",
      "Kiểm tra bước tạo bài: lớp này có được tích trong \"Lớp áp dụng\" không (để trống = tất cả lớp).",
      "Hỏi SV: họ đã đăng ký đúng mã lớp của mình chưa (so với danh sách mã lớp giảng viên phổ biến).",
    ],
    escalate:
      "Nếu SV đăng ký SAI mã lớp → không tự sửa, báo dev: tên + MSV + mã lớp hiện tại + mã lớp đúng.",
  },
  {
    code: "4",
    title: "SV không nghe được audio",
    symptom: "Nhấn Play không có tiếng, hoặc báo lỗi lấy file.",
    steps: [
      "Yêu cầu SV bấm \"Play\" lại 1 lần (lỗi mạng/chậm hay tự hết).",
      "Kiểm tra bài đó có audio chưa: vào Quản lý bài nghe → Sửa bài → bước 2 xem có key audio không.",
      "Thử mở trang bài đó trên điện thoại 4G (không Wi-Fi) để loại trừ Wi-Fi lớp học.",
    ],
    escalate: "Audio thật sự lỗi (toàn bộ lớp bị) → báo dev: giờ + tên + số thứ tự bài.",
  },
  {
    code: "5",
    title: "SV không nhận được email (xác nhận, đổi mật khẩu)",
    symptom: "Đăng ký xong không có email xác nhận, hoặc bấm \"quên mật khẩu\" không nhận link.",
    steps: [
      "Yêu cầu SV kiểm tra hộp Thư rác / Spam.",
      "Yêu cầu SV thử bấm \"Quên mật khẩu\" 1 lần nữa (email có thể chậm vài phút).",
      "Kiểm tra email SV nhập có sai chính tả không (@gmail.com thành @gmail.vn...).",
    ],
    escalate:
      "Vẫn không nhận sau 15 phút → báo dev: email nào + loại email (xác nhận / đặt lại mật khẩu).",
  },
  {
    code: "6",
    title: "SV đăng ký sai mã lớp",
    symptom: "SV thấy danh sách bài của lớp khác, hoặc làm bài bị báo \"chưa mở\" dù lớp đã mở.",
    steps: [
      "Xác nhận mã lớp đúng (theo danh sách giảng viên phổ biến) và mã lớp SV đã nhập khi đăng ký.",
      "KHÔNG tự sửa mã lớp của SV — hiện chưa có nút để sửa trong hệ thống.",
    ],
    escalate: "Báo dev: tên + MSV + mã lớp hiện tại + mã lớp đúng. Dev sẽ sửa trong database.",
  },
  {
    code: "7",
    title: "Tạo / sửa bài lỗi (upload audio, lưu bài bị báo lỗi)",
    symptom: "Upload MP3 không xong, hoặc bấm Lưu báo lỗi đỏ.",
    steps: [
      "Thử lại 1 lần (lỗi thường do mạng chập chờn).",
      "File MP3 có đúng định dạng .mp3, dung lượng hợp lý (dưới ~50MB) không?",
      "Lưu bài ĐÃ CÓ SV làm → chỉ sửa được đáp án đúng, KHÔNG thêm/xóa ô trống.",
    ],
    escalate: "Lỗi vẫn lặp lại → báo dev: bước nào trong wizard + chụp màn hình nội dung lỗi.",
  },
  {
    code: "8",
    title: "Không rõ lỗi / nằm ngoài danh sách trên",
    symptom: "Bất kỳ triệu chứng nào không khớp 7 mục trên.",
    steps: [
      "Bấm \"🩺 Kiểm tra hệ thống\" 1 lần, ghi lại kết quả.",
      "Yêu cầu người báo lỗi chụp màn hình đang gặp.",
      "Ghi rõ: giờ, bài (số thứ tự + tên), lớp, tên + MSV SV (nếu có).",
    ],
    escalate: "Báo dev đủ 4 mục: giờ / triệu chứng / bài + lớp / ảnh chụp.",
  },
];

export default async function TroubleshootingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="button button-subtle">
              ← Quay lại Admin
            </Link>
            <BrandLogo
              href="/admin/troubleshooting"
              kicker="TEACHER SPACE"
              name="Sổ tay sự cố"
            />
          </div>
          <span className="user-chip">Admin</span>
        </div>
      </header>

      <main className="content-wrap space-y-6">
        <div>
          <h1 className="text-xl font-semibold mb-1">Khi có sự cố trong buổi SV làm bài</h1>
          <p className="text-sm text-gray-500">
            Nguyên tắc: chỉ làm các bước &ldquo;tự kiểm tra&rdquo; trong bảng bên dưới. Những thứ
            trong &ldquo;Vùng đỏ&rdquo; — tuyệt đối không tự động, chỉ báo dev.
          </p>
        </div>

        <HealthCheckButton />

        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-lg font-semibold mb-3">Các sự cố thường gặp</h2>
          <p className="text-sm text-gray-500 mb-3">
            Bấm vào một sự cố để xem chi tiết xử lý.
          </p>
          <div className="space-y-3">
            {incidents.map((inc) => (
              <details key={inc.code} className="border rounded-lg">
                <summary className="cursor-pointer select-none p-4">
                  <div className="font-medium text-gray-900">
                    {inc.code}. {inc.title}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{inc.symptom}</div>
                </summary>
                <div className="px-4 pb-4 border-t">
                  <p className="text-xs font-semibold text-blue-700 uppercase mt-3 mb-1">
                    Tự kiểm tra
                  </p>
                  <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 mb-3">
                    {inc.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <p className="text-xs font-semibold text-red-700 uppercase mb-1">
                    Nếu vẫn lỗi
                  </p>
                  <p className="text-sm text-gray-700">{inc.escalate}</p>
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-800 mb-2">🟢 Vùng xanh — bạn tự làm được</h3>
            <ul className="text-sm text-green-900 space-y-1 list-disc list-inside">
              <li>Bấm Mở/Đóng bài cho lớp (bảng &ldquo;Mở/đóng bài theo lớp&rdquo;)</li>
              <li>Cấp quyền làm lại (makeup) cho SV</li>
              <li>Tạo / sửa bài qua 4 bước</li>
              <li>Hướng dẫn SV: thử lại, đăng nhập lại, kiểm tra Spam</li>
              <li>Chụp màn hình + ghi lại thông tin để báo dev</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-medium text-red-800 mb-2">🔴 Vùng đỏ — CẤM TỰ ĐỘNG, CHỈ BÁO DEV</h3>
            <ul className="text-sm text-red-900 space-y-1 list-disc list-inside">
              <li>Trang bảng biểu của nhà cung cấp (Supabase dashboard)</li>
              <li>Trang quản lý hosting (Vercel, Cloudflare)</li>
              <li>Cấu hình email (Resend), cấu hình CORS, backup/khôi phục</li>
              <li>Sửa mã lớp của SV, sửa dữ liệu trong database</li>
              <li>Bất kỳ thứ nào không có nút trong hệ thống này</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
