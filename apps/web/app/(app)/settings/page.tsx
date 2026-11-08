import Link from "next/link";
import { copy } from "@sparrow/shared";
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
      <div className="panel">
        <h3>Support</h3>
        <p className="quiet">If things feel like too much, there are people who can help.</p>
        <Link className="button" href="/help">{copy.helpTitle}</Link>
      </div>
    </>
  );
}
