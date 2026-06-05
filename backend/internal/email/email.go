package email

import (
	"fmt"
	"net/smtp"
	"strings"
)

type Mailer struct {
	host     string
	port     string
	username string
	password string
	from     string
}

func New(host, port, username, password, from string) *Mailer {
	if from == "" {
		from = username
	}
	return &Mailer{host: host, port: port, username: username, password: password, from: from}
}

func (m *Mailer) Send(to, subject, htmlBody string) error {
	if m == nil || m.host == "" {
		return fmt.Errorf("email not configured")
	}
	addr := m.host + ":" + m.port
	auth := smtp.PlainAuth("", m.username, m.password, m.host)

	msg := strings.Join([]string{
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"From: BKDNAIOJ <" + m.from + ">",
		"To: " + to,
		"Subject: " + subject,
		"",
		htmlBody,
	}, "\r\n")

	return smtp.SendMail(addr, auth, m.from, []string{to}, []byte(msg))
}

func (m *Mailer) SendPasswordReset(to, resetURL string) error {
	subject := "Đặt lại mật khẩu BKDNAIOJ"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f8fafc">
  <div style="background:#0f172a;padding:1.5rem;border-radius:8px 8px 0 0;text-align:center">
    <span style="color:#fff;font-size:1.4rem;font-weight:800">BKDNAIOJ</span>
  </div>
  <div style="background:#fff;padding:2rem;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
    <h2 style="color:#0f172a;margin-top:0">Đặt lại mật khẩu</h2>
    <p style="color:#475569">Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản BKDNAIOJ.</p>
    <p style="color:#475569">Nhấn nút bên dưới để tạo mật khẩu mới. Link có hiệu lực trong <strong>30 phút</strong>.</p>
    <div style="text-align:center;margin:2rem 0">
      <a href="%s" style="background:#1e40af;color:#fff;padding:0.75rem 2rem;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
        Đặt lại mật khẩu
      </a>
    </div>
    <p style="color:#94a3b8;font-size:0.82rem">Nếu bạn không yêu cầu điều này, hãy bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0">
    <p style="color:#94a3b8;font-size:0.75rem;text-align:center">BKDNAIOJ — AI Competition Platform</p>
  </div>
</body>
</html>`, resetURL)
	return m.Send(to, subject, body)
}
