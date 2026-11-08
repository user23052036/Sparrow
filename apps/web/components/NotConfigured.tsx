export function NotConfigured() {
  return (
    <main className="shell">
      <div className="panel">
        <h2>Sparrow needs a Supabase project</h2>
        <p>
          Copy <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code>, fill in your project URL and anon key, then restart{" "}
          <code>npm run dev</code>.
        </p>
        <p className="quiet">Setup steps are in the README.</p>
      </div>
    </main>
  );
}
