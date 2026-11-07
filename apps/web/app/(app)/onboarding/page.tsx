import { ProfileForm } from "../ProfileForm";

export default function Onboarding() {
  return (
    <>
      <h1>Welcome to Sparrow</h1>
      <p className="quiet">Three quick things, then you'll add the tasks you want help with.</p>
      <ProfileForm mode="onboarding" />
    </>
  );
}
