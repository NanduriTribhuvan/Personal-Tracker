import { describe, expect, it } from 'vitest';
import type { BetInput } from '../types';
import { LocalAuthService } from './localAuth';
import { LocalRepository } from './localRepository';

const bet: BetInput = {
  betName: 'Pick',
  sport: 'Cricket',
  league: null,
  event: null,
  betType: 'moneyline',
  stake: 500,
  odds: 1.9,
  status: 'pending',
  cashoutAmount: null,
  bookmaker: null,
  referenceId: null,
  notes: null,
  tags: [],
  betDate: '2026-10-26T10:00:00.000Z',
};

const fast = (extra = {}) => new LocalAuthService({ iterations: 1000, ...extra });

describe('local auth', () => {
  it('requires setup first and stores only a hash', async () => {
    const auth = fast();
    expect(await auth.needsSetup()).toBe(true);
    await auth.setup('tester', 'secret123');
    const raw = localStorage.getItem('edgetrack:v1:accounts')!;
    expect(raw).not.toContain('secret123');
    expect(await auth.needsSetup()).toBe(false);
  });

  it('rejects wrong credentials and accepts correct ones', async () => {
    const auth = fast();
    await auth.setup('tester', 'secret123');
    await auth.signOut();
    await expect(auth.signIn('tester', 'nope')).rejects.toThrow(/Invalid username or password/);
    await expect(auth.signIn('nobody', 'secret123')).rejects.toThrow(/Invalid username or password/);
    expect(await auth.signIn('TESTER', 'secret123')).toMatchObject({ username: 'tester' });
  });

  it('locks out after repeated failures', async () => {
    const auth = fast({ maxFailures: 3 });
    await auth.setup('tester', 'secret123');
    await auth.signOut();
    for (let i = 0; i < 3; i++) await expect(auth.signIn('tester', 'bad')).rejects.toThrow();
    await expect(auth.signIn('tester', 'secret123')).rejects.toThrow(/Too many/);
  });

  it('sessions expire after inactivity', async () => {
    let t = 1_000_000;
    const auth = fast({ now: () => t, idleTimeoutMs: 60_000 });
    await auth.setup('tester', 'secret123');
    expect(await auth.getCurrentUser()).not.toBeNull();
    t += 61_000;
    expect(await auth.getCurrentUser()).toBeNull();
  });

  it('changes password only with the current password', async () => {
    const auth = fast();
    await auth.setup('tester', 'secret123');
    await expect(auth.changePassword('wrong', 'newpass123')).rejects.toThrow(/incorrect/);
    await auth.changePassword('secret123', 'newpass123');
    await auth.signOut();
    await expect(auth.signIn('tester', 'secret123')).rejects.toThrow();
    await expect(auth.signIn('tester', 'newpass123')).resolves.toBeTruthy();
  });
});

describe('local repository', () => {
  it('persists across instances (refresh)', async () => {
    const a = new LocalRepository('user-a', 'a');
    const created = await a.createBet(bet);
    const reopened = new LocalRepository('user-a', 'a');
    expect(await reopened.listBets()).toEqual([created]);
  });

  it('isolates users from each other', async () => {
    const a = new LocalRepository('user-a', 'a');
    const b = new LocalRepository('user-b', 'b');
    const own = await a.createBet(bet);
    expect(await b.listBets()).toEqual([]);
    await expect(b.deleteBet(own.id)).rejects.toThrow(/not found/);
    await expect(b.updateBet(own.id, bet)).rejects.toThrow(/not found/);
    expect(await a.listBets()).toHaveLength(1);
  });

  it('editing keeps id/created date and sets settledAt', async () => {
    const repo = new LocalRepository('user-a', 'a');
    const created = await repo.createBet(bet);
    const updated = await repo.updateBet(created.id, { ...bet, status: 'won' });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.settledAt).not.toBeNull();
    expect(await repo.listBets()).toHaveLength(1);
  });

  it('rejects invalid bets and duplicate initial bankrolls', async () => {
    const repo = new LocalRepository('user-a', 'a');
    await expect(repo.createBet({ ...bet, stake: 0 })).rejects.toThrow();
    await expect(repo.createBet({ ...bet, status: 'cashed_out' })).rejects.toThrow();
    await repo.createTransaction({ type: 'initial', amount: 1000, occurredAt: bet.betDate, description: null });
    await expect(repo.createTransaction({ type: 'initial', amount: 5, occurredAt: bet.betDate, description: null })).rejects.toThrow(/initial/);
  });
});
