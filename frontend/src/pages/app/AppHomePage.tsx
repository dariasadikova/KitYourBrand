export function AppHomePage() {
  return (
    <div className="page">
      <h2 style={{ marginTop: 0 }}>Личный кабинет</h2>
      <p className="muted">
        Следующий блок: список проектов и навигация к редактору. Здесь пока только каркас после успешного{' '}
        <code>/api/auth/me</code>.
      </p>
    </div>
  );
}
