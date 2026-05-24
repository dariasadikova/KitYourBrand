import { Link } from 'react-router-dom'

type DemoLockedActionProps = {
  label: string
  message: string
}

export function DemoLockedAction({ label, message }: DemoLockedActionProps) {
  return (
    <div className="demo-locked-action">
      <button type="button" className="btn btn-secondary" disabled>
        {label}
      </button>
      <p className="demo-locked-action__hint">{message}</p>
      <Link to="/register" className="btn btn-primary btn-inline">Регистрация</Link>
    </div>
  )
}
