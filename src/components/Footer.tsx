export default function Footer() {
  return (
    <footer className="container">
      <span>© {new Date().getFullYear()} SyncStock</span>
      <div className="footer-links">
        <a href="/docs">Docs</a>
        <a href="/support">Support</a>
        <a href="/feedback">Feedback</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </div>
    </footer>
  );
}
