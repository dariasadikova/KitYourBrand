import { type FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { deleteAccount, getProfile, updateProfile } from '../services/profileApi'
import type { Profile } from '../types/profile'
import { EmailIcon, LockIcon, UserIcon } from '../components/icons'

export function ProfilePage({
  onSessionRefresh,
  onLogout,
}: {
  onSessionRefresh: () => Promise<void>
  onLogout: () => Promise<void>
}) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [recraftApiKey, setRecraftApiKey] = useState('')
  const [openrouterApiKey, setOpenrouterApiKey] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [highlightMissingCurrentPassword, setHighlightMissingCurrentPassword] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  useEffect(() => {
    if (!deleteConfirmOpen) return
    document.body.classList.add('modal-open')
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeletingAccount) setDeleteConfirmOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [deleteConfirmOpen, isDeletingAccount])

  useEffect(() => {
    let alive = true

    getProfile()
      .then((payload) => {
        if (!alive) return
        setProfile(payload.profile)
        setName(payload.profile.name)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить профиль.')
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setHighlightMissingCurrentPassword(false)

    const form = event.currentTarget
    const submittedCurrent = String(new FormData(form).get('current_password') ?? '').trim()
    const submittedNew = String(new FormData(form).get('new_password') ?? '').trim()
    const submittedConfirm = String(new FormData(form).get('new_password_confirm') ?? '').trim()

    const wantsPasswordChange = Boolean(submittedCurrent || submittedNew || submittedConfirm)
    if (wantsPasswordChange) {
      if (!submittedCurrent) {
        setHighlightMissingCurrentPassword(true)
        setError('Введите текущий пароль.')
        return
      }
      if (!submittedNew) {
        setError('Введите новый пароль.')
        return
      }
      if (submittedNew.length < 8) {
        setError('Новый пароль должен содержать минимум 8 символов.')
        return
      }
      if (submittedNew !== submittedConfirm) {
        setError('Новый пароль и подтверждение не совпадают.')
        return
      }
    }

    setIsSaving(true)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('current_password', submittedCurrent)
    formData.append('new_password', submittedNew)
    formData.append('new_password_confirm', submittedConfirm)
    formData.append('remove_avatar', '0')
    formData.append('recraft_api_key', recraftApiKey)
    formData.append('openrouter_api_key', openrouterApiKey)
    if (avatar) formData.append('avatar', avatar)

    try {
      const payload = await updateProfile(formData)
      setProfile(payload.profile)
      setName(payload.profile.name)
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      setRecraftApiKey('')
      setOpenrouterApiKey('')
      setAvatar(null)
      setSuccess('Изменения сохранены')
      setHighlightMissingCurrentPassword(false)
      await onSessionRefresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сохранить профиль.'
      setError(message)
      if (/текущий пароль/i.test(message)) {
        setHighlightMissingCurrentPassword(true)
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword.trim()) {
      setError('Введите пароль для подтверждения удаления аккаунта.')
      return
    }

    setIsDeletingAccount(true)
    setError('')
    setSuccess('')

    try {
      await deleteAccount(deletePassword)
      setDeleteConfirmOpen(false)
      setDeletePassword('')
      await onLogout()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить аккаунт.')
    } finally {
      setIsDeletingAccount(false)
    }
  }

  async function handleRemoveAvatar() {
    setError('')
    setSuccess('')

    const formData = new FormData()
    formData.append('name', name)
    formData.append('current_password', '')
    formData.append('new_password', '')
    formData.append('new_password_confirm', '')
    formData.append('remove_avatar', '1')
    formData.append('recraft_api_key', '')
    formData.append('openrouter_api_key', '')

    try {
      const payload = await updateProfile(formData)
      setProfile(payload.profile)
      setSuccess('Изменения сохранены')
      await onSessionRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить фото профиля.')
    }
  }

  if (isLoading) {
    return (
      <section className="profile-page">
        <div className="profile-page__head">
          <h1>Профиль пользователя</h1>
          <p>Управляйте настройками вашего аккаунта</p>
        </div>
        <div className="profile-alert">Загружаем профиль...</div>
      </section>
    )
  }

  return (
    <section className="profile-page">
      <div className="profile-page__head">
        <h1>Профиль пользователя</h1>
        <p>Управляйте настройками вашего аккаунта</p>
      </div>

      {error ? <div className="profile-alert profile-alert--error">{error}</div> : null}
      {success ? <div className="profile-alert profile-alert--success">{success}</div> : null}

      <form className="profile-form" onSubmit={handleSubmit}>
        <article className="profile-card">
          <h2>Основная информация</h2>
          <div className="profile-info-grid">
            <div className="profile-avatar-block">
              <div className="profile-avatar-frame">
                {profile?.avatar_url ? (
                  <>
                    <img src={profile.avatar_url} alt="Аватар пользователя" className="profile-avatar-image" />
                    <button type="button" className="profile-avatar-delete-btn" aria-label="Удалить фото профиля" title="Удалить фото" onClick={handleRemoveAvatar}>
                      <svg viewBox="0 0 512 512" aria-hidden="true">
                        <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H384l-7.2-14.3C366 6.9 349.6 0 332.8 0H179.2c-16.8 0-33.2 6.9-44 17.7zM32 128H480L456.7 467.1c-1.7 24.6-22.1 43.9-46.8 43.9H102.1c-24.7 0-45.1-19.3-46.8-43.9L32 128z" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="profile-avatar-circle">{profile?.initial || '?'}</div>
                )}
              </div>
              <label className="btn btn-outline btn-inline profile-upload-btn">
                <svg className="profile-upload-btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
                Загрузить фото
                <input type="file" name="avatar" accept=".png,.jpg,.jpeg,.webp" hidden onChange={(event) => setAvatar(event.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="profile-fields">
              <label className="editor-field">
                <span>ФИО</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <UserIcon />
                  </span>
                  <input type="text" name="name" value={name} minLength={2} required onChange={(event) => setName(event.target.value)} />
                </span>
              </label>
              <label className="editor-field">
                <span>Email</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <EmailIcon />
                  </span>
                  <input type="email" className="profile-email-input" value={profile?.email || ''} disabled />
                </span>
              </label>
              <p className="profile-field-hint">Email нельзя изменить</p>
              <div className="profile-role-row">
                <span>Роль:</span>
                <strong>User</strong>
              </div>
            </div>
          </div>
        </article>

        <div className="profile-credentials-row">
          <article className="profile-card profile-card--password-change">
            <h2>Смена пароля</h2>
            <p className="profile-field-hint profile-card__intro-hint">
              Чтобы сменить пароль, заполните все три поля. Оставьте пустыми, если пароль менять не нужно.
            </p>
            <div className="profile-password-grid profile-password-grid--change-password">
              <label className="editor-field">
                <span>Текущий пароль</span>
                <span
                  className={`profile-input-wrap${highlightMissingCurrentPassword ? ' profile-input-wrap--error' : ''}`}
                >
                  <span className="profile-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    name="current_password"
                    placeholder="Введите текущий пароль"
                    value={currentPassword}
                    autoComplete="current-password"
                    aria-invalid={highlightMissingCurrentPassword}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value)
                      if (event.target.value.trim()) setHighlightMissingCurrentPassword(false)
                    }}
                  />
                </span>
              </label>
              <label className="editor-field">
                <span>Новый пароль</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    name="new_password"
                    placeholder="Введите новый пароль"
                    value={newPassword}
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </span>
                <p className="profile-field-hint">Минимум 8 символов</p>
              </label>
              <label className="editor-field">
                <span>Подтвердите новый пароль</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    name="new_password_confirm"
                    placeholder="Повторите новый пароль"
                    value={newPasswordConfirm}
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  />
                </span>
              </label>
            </div>
          </article>

          <article className="profile-card">
            <h2>API ключи провайдеров</h2>
            <div className="profile-password-grid">
              <label className="editor-field">
                <span>Recraft API key</span>
                <div className="profile-input-adorned">
                  <input
                    type="password"
                    name="recraft_api_key"
                    placeholder={profile?.api_keys?.recraft?.configured ? `Сохранён: ${profile.api_keys.recraft.masked}` : 'Введите Recraft API key'}
                    value={recraftApiKey}
                    onChange={(event) => setRecraftApiKey(event.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="profile-api-info-btn profile-input-adorned__hint"
                    aria-label="Подсказка: Recraft API key"
                    aria-describedby="profile-api-hint-recraft"
                  >
                    i
                  </button>
                  <span id="profile-api-hint-recraft" className="profile-input-adorned__tooltip" role="tooltip">
                    Оставьте поле пустым, чтобы сохранить текущий ключ
                  </span>
                </div>
              </label>
              <label className="editor-field">
                <span>OpenRouter API key</span>
                <div className="profile-input-adorned">
                  <input
                    type="password"
                    name="openrouter_api_key"
                    placeholder={profile?.api_keys?.openrouter?.configured ? `Сохранён: ${profile.api_keys.openrouter.masked}` : 'Введите OpenRouter API key'}
                    value={openrouterApiKey}
                    onChange={(event) => setOpenrouterApiKey(event.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="profile-api-info-btn profile-input-adorned__hint"
                    aria-label="Подсказка: OpenRouter API key"
                    aria-describedby="profile-api-hint-openrouter"
                  >
                    i
                  </button>
                  <span id="profile-api-hint-openrouter" className="profile-input-adorned__tooltip" role="tooltip">
                    Используется для Seedream, Flux, Nano Banana и GPT-5 Image Mini
                  </span>
                </div>
              </label>
            </div>
          </article>
        </div>

        <div className="profile-actions">
          <Link to="/profile" className="btn btn-outline btn-inline">Отмена</Link>
          <button type="submit" className="btn btn-primary btn-inline" disabled={isSaving}>
            {isSaving ? 'Сохраняем...' : 'Сохранить изменения'}
          </button>
        </div>
      </form>

      <article className="profile-card profile-card--danger">
        <h2>Удаление аккаунта</h2>
        <p className="profile-danger-text">
          Будут безвозвратно удалены профиль, проекты, история генераций, загруженные файлы и сохранённые API-ключи.
          Это действие нельзя отменить.
        </p>
        <button
          type="button"
          className="btn btn-danger btn-inline"
          onClick={() => {
            setError('')
            setSuccess('')
            setDeletePassword('')
            setDeleteConfirmOpen(true)
          }}
        >
          Удалить аккаунт
        </button>
      </article>

      {deleteConfirmOpen && typeof document !== 'undefined'
        ? createPortal(
          <div className="app-confirm-modal" role="presentation">
            <button
              type="button"
              className="app-confirm-modal__backdrop"
              aria-label="Закрыть"
              disabled={isDeletingAccount}
              onClick={() => {
                if (!isDeletingAccount) setDeleteConfirmOpen(false)
              }}
            />
            <div
              className="app-confirm-modal__dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="profile-delete-account-title"
              aria-describedby="profile-delete-account-message"
            >
              <button
                type="button"
                className="app-confirm-modal__close"
                aria-label="Закрыть"
                disabled={isDeletingAccount}
                onClick={() => setDeleteConfirmOpen(false)}
              >
                ×
              </button>
              <h2 className="app-confirm-modal__title" id="profile-delete-account-title">
                Удалить аккаунт?
              </h2>
              <p className="app-confirm-modal__message" id="profile-delete-account-message">
                Введите текущий пароль, чтобы подтвердить удаление. Все данные аккаунта будут удалены без возможности восстановления.
              </p>
              <label className="editor-field profile-delete-password-field">
                <span>Текущий пароль</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    name="delete_account_password"
                    placeholder="Введите пароль"
                    value={deletePassword}
                    autoComplete="current-password"
                    disabled={isDeletingAccount}
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                </span>
              </label>
              <div className="app-confirm-modal__actions">
                <button
                  type="button"
                  className="btn btn-outline btn-inline app-confirm-modal__cancel"
                  disabled={isDeletingAccount}
                  onClick={() => setDeleteConfirmOpen(false)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-inline"
                  disabled={isDeletingAccount}
                  onClick={() => void handleDeleteAccount()}
                >
                  {isDeletingAccount ? 'Удаляем...' : 'Удалить аккаунт'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </section>
  )
}
