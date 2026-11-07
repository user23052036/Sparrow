import Link from "next/link";
import { ProfileForm } from "../ProfileForm";

export default function Settings() {
  return (
    <>
      <h1>Settings</h1>
      <ProfileForm mode="settings" />
      <div className="panel">
        <h3>Browser extension</h3>
        <p className="quiet">The extension blocks distracting sites on this computer during focus sessions.</p>
        <Link className="button" href="/extension">Connect the extension</Link>
      </div>
    </>
  );
}
