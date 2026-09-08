export default function Footer() {
  return (
    <footer className="container">
      <span>© {new Date().getFullYear()} SyncStock</span>
      <div className="footer-links">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="mailto:support@syncstock.app">Contact</a>
      </div>
    </footer>
  );
}
