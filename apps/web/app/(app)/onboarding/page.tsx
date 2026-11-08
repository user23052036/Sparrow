import { copy } from "@sparrow/shared";
import { ProfileForm } from "../ProfileForm";

export default function Onboarding() {
  return (
    <>
      <h1>{copy.onboarding.title}</h1>
      <p className="quiet">{copy.onboarding.intro}</p>
      <ProfileForm mode="onboarding" />
    </>
  );
}
