# Regression Checklist (UI Migration)

This checklist is required before removing any legacy Jinja templates or static JS/CSS.

## Auth / Session

- [ ] Register in React (`/register`) and login in React (`/login`)
- [ ] `GET /api/auth/me` returns user when authenticated
- [ ] Logout works and protected routes redirect to `/login`

## Projects / Editor

- [ ] Project list loads in React (`/app/projects`)
- [ ] Create project works from React
- [ ] Project editor opens in React
- [ ] Save tokens and reset tokens work from React editor

## Generation Job Lifecycle

- [ ] Start generation from React editor
- [ ] Polling updates live status/messages/logs
- [ ] Cancel works while generation is active
- [ ] Cancel is unavailable/handled correctly for terminal statuses

## Results / History

- [ ] React results page renders generated assets by sections
- [ ] React history page loads pagination and rows
- [ ] Delete selected history records works
- [ ] Clear history works

## Critical Status Semantics

- [ ] `completed_with_errors` is treated as terminal everywhere
- [ ] No false "active generation" modal/state after partial success
- [ ] Results remain available for partial-success runs

## Legacy Fallback (Must Still Work During Transition)

- [ ] `/dashboard` opens
- [ ] `/projects/{slug}` opens legacy editor
- [ ] `/projects/{slug}/results` opens legacy results
- [ ] `/generation-history` opens legacy history

## Safety Notes

- Do not change DB engine/storage in this phase.
- Do not change provider execution contracts in this phase.
- Remove legacy templates/static files only after all checks pass.
