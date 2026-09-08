"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return <button type="button" className="btn btn-secondary" onClick={logout}>Log out</button>;
}
