import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { LocalAuthService } from './data/localAuth';

describe('authentication protection', () => {
  it('redirects unauthenticated users from private routes to sign-in/setup', async () => {
    window.history.pushState({}, '', '/bets');
    render(<App service={new LocalAuthService({ iterations: 1000 })} />);
    expect(await screen.findByRole('form', { name: /create account/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByText('My Bets')).not.toBeInTheDocument();
  });

  it('shows sign-in when an account exists, and rejects bad passwords', async () => {
    const service = new LocalAuthService({ iterations: 1000 });
    await service.setup('tester', 'secret123');
    await service.signOut();
    window.history.pushState({}, '', '/');
    render(<App service={service} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Username'), 'tester');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument();
  });

  it('signs in, then adds a bet with a live payout preview', async () => {
    const service = new LocalAuthService({ iterations: 1000 });
    await service.setup('tester', 'secret123');
    await service.signOut();
    window.history.pushState({}, '', '/');
    render(<App service={service} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Username'), 'tester');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await user.click((await screen.findAllByRole('button', { name: /add your first bet/i }))[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/pick \/ bet name/i), 'India to win');
    await user.type(screen.getByLabelText(/^stake/i), '500');
    await user.type(screen.getByLabelText(/decimal odds/i), '1.90');
    expect(screen.getByTestId('preview-potential-payout').textContent).toMatch(/950/);
    expect(screen.getByTestId('preview-potential-profit').textContent).toMatch(/450/);

    await user.type(screen.getByLabelText(/sport \/ category/i), 'Cricket');
    await user.click(screen.getByRole('button', { name: /^add bet$/i }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect((await screen.findAllByText('India to win')).length).toBeGreaterThan(0);
  });
});
