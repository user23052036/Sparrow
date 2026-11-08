import Link from "next/link";
import { copy } from "@sparrow/shared";
import { ProfileForm } from "../ProfileForm";

export default function Settings() {
  return (
    <>
      <h1>{copy.settings.title}</h1>
      <ProfileForm mode="settings" />
      <div className="panel">
        <h3>{copy.settings.extensionTitle}</h3>
        <p className="quiet">{copy.settings.extensionBody}</p>
        <Link className="button" href="/extension">
          {copy.settings.extensionBtn}
        </Link>
      </div>
      <div className="panel">
        <h3>{copy.settings.supportTitle}</h3>
        <p className="quiet">{copy.settings.supportBody}</p>
        <Link className="button" href="/help">
          {copy.helpTitle}
        </Link>
      </div>
    </>
  );
}
