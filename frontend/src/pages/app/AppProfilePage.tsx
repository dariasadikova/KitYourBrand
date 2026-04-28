import { type FormEvent, useEffect, useState } from 'react';
import { fetchProfile, updateProfile } from '@/api/profile';
import { useAuth } from '@/auth/AuthContext';

export function AppProfilePage() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const user = await fetchProfile();
        setName(user.name || '');
        setEmail(user.email || '');
        setAvatarUrl(user.avatar_url || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить профиль.');
      } finally {
        setLoading(false);
      }
    }
    void loadProfile();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const user = await updateProfile({
        name,
        currentPassword,
        newPassword,
        removeAvatar,
        avatarFile,
      });
      setName(user.name || '');
      setEmail(user.email || '');
      setAvatarUrl(user.avatar_url || null);
      setCurrentPassword('');
      setNewPassword('');
      setAvatarFile(null);
      setRemoveAvatar(false);
      setSuccess('Изменения сохранены.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить профиль.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page-center muted">Загрузка профиля…</div>;
  }

  return (
    <div className="page">
      <h2 style={{ marginTop: 0 }}>Профиль</h2>
      <div className="card" style={{ maxWidth: 640 }}>
        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="callout callout-success">{success}</div> : null}

        <form onSubmit={(e) => void onSubmit(e)}>
          <div className="profile-avatar-row">
            <div className="profile-avatar-preview">
              {avatarUrl && !removeAvatar ? (
                <img src={avatarUrl} alt="Аватар" />
              ) : (
                <span>{(name.trim()[0] || email.trim()[0] || '?').toUpperCase()}</span>
              )}
            </div>
            <div className="profile-avatar-controls">
              <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                Выбрать аватар
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setAvatarFile(file);
                    if (file) {
                      setRemoveAvatar(false);
                    }
                  }}
                />
              </label>
              <label className="profile-checkbox">
                <input
                  type="checkbox"
                  checked={removeAvatar}
                  onChange={(e) => setRemoveAvatar(e.target.checked)}
                />
                Удалить текущий аватар
              </label>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="profile-name">Имя</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              minLength={2}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={email} disabled />
          </div>

          <div className="form-field">
            <label htmlFor="profile-current-password">Текущий пароль</label>
            <input
              id="profile-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="form-field">
            <label htmlFor="profile-new-password">Новый пароль</label>
            <input
              id="profile-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
