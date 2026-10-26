import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Cloud, Database, Download, FileJson, HardDrive, KeyRound, SlidersHorizontal, Upload } from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, fieldAria } from '@/components/ui/input';
import { Badge, Segmented } from '@/components/ui/misc';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { CURRENCY_META, DATE_FORMAT_LABELS, DATE_RANGE_LABELS, STATUS_LABELS } from '@/lib/constants';
import { betsToCsv } from '@/lib/csv';
import { downloadFile } from '@/lib/utils';
import { backupSchema, passwordChangeSchema, type BackupPayload, type PasswordChangeValues } from '@/lib/validation';
import {
  BET_STATUSES,
  CURRENCIES,
  DATE_FORMATS,
  DATE_RANGE_PRESETS,
  type BackupFile,
  type UserSettings,
} from '@/types';

export function SettingsPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="Settings" description="Preferences, security and your data." />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <PreferencesCard />
        <div className="space-y-4 sm:space-y-6">
          <AccountCard />
          <DataCard />
        </div>
      </div>
    </div>
  );
}

function PreferencesCard() {
  const { settings, updateSettings, loading } = useData();
  const [draft, setDraft] = React.useState<UserSettings>(settings);
  const [stake, setStake] = React.useState(settings.defaultStake ? String(settings.defaultStake) : '');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(settings);
    setStake(settings.defaultStake ? String(settings.defaultStake) : '');
  }, [settings]);

  const stakeNum = stake.trim() === '' ? null : Number(stake.replace(/,/g, ''));
  const stakeError =
    stakeNum !== null && !(Number.isFinite(stakeNum) && stakeNum > 0 && /^\d+(\.\d{1,2})?$/.test(stake.replace(/,/g, '').trim()))
      ? 'Enter a positive amount (up to 2 decimals), or leave blank'
      : undefined;
  const next: UserSettings = { ...draft, defaultStake: stakeError ? draft.defaultStake : stakeNum };
  const dirty = JSON.stringify(next) !== JSON.stringify(settings);

  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" aria-hidden /> Preferences
          </CardTitle>
          <CardDescription>How numbers and dates are displayed, and form defaults</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (stakeError) return;
            setSaving(true);
            try {
              await updateSettings(next);
              toast.success('Preferences saved');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Could not save preferences');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Field id="s-currency" label="Preferred currency">
            <Select id="s-currency" value={draft.currency} onChange={(e) => set('currency', e.target.value as UserSettings['currency'])}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_META[c].symbol} {c} — {CURRENCY_META[c].name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="s-date" label="Date format">
              <Select id="s-date" value={draft.dateFormat} onChange={(e) => set('dateFormat', e.target.value as UserSettings['dateFormat'])}>
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {DATE_FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted-foreground" id="s-odds-label">
                Odds precision
              </span>
              <Segmented
                label="Odds precision"
                className="w-full"
                value={String(draft.oddsPrecision) as '2' | '3'}
                onChange={(v) => set('oddsPrecision', v === '3' ? 3 : 2)}
                options={[
                  { value: '2', label: '1.90' },
                  { value: '3', label: '1.905' },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="s-stake" label="Default stake" error={stakeError} hint="Pre-fills the add-bet form">
              <Input
                {...fieldAria('s-stake', stakeError, true)}
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="None"
                className="tabular"
              />
            </Field>
            <Field id="s-status" label="Default bet status">
              <Select id="s-status" value={draft.defaultStatus} onChange={(e) => set('defaultStatus', e.target.value as UserSettings['defaultStatus'])}>
                {BET_STATUSES.filter((s) => s !== 'cashed_out').map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field id="s-range" label="Default dashboard date range" hint="Applied when you open EdgeTrack">
            <Select
              id="s-range"
              value={draft.dashboardRange}
              onChange={(e) => set('dashboardRange', e.target.value as UserSettings['dashboardRange'])}
              aria-describedby="s-range-hint"
            >
              {DATE_RANGE_PRESETS.filter((p) => p !== 'custom').map((p) => (
                <option key={p} value={p}>
                  {DATE_RANGE_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              disabled={!dirty || saving}
              onClick={() => {
                setDraft(settings);
                setStake(settings.defaultStake ? String(settings.defaultStake) : '');
              }}
            >
              Reset
            </Button>
            <Button type="submit" loading={saving} disabled={!dirty || !!stakeError || loading}>
              Save preferences
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountCard() {
  const { user, service, changePassword } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeValues>({ resolver: zodResolver(passwordChangeSchema), defaultValues: { current: '', next: '', confirm: '' } });

  const submit = handleSubmit(async ({ current, next }) => {
    try {
      await changePassword(current, next);
      reset();
      toast.success('Password changed');
    } catch (e) {
      setError('current', { message: e instanceof Error ? e.message : 'Could not change password' });
    }
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" aria-hidden /> Account & security
          </CardTitle>
          <CardDescription>
            Signed in as <span className="font-medium text-foreground">{user?.username}</span>
          </CardDescription>
        </div>
        <Badge tone={service.mode === 'supabase' ? 'primary' : 'warning'}>
          {service.mode === 'supabase' ? (
            <>
              <Cloud className="size-3" aria-hidden /> Supabase
            </>
          ) : (
            <>
              <HardDrive className="size-3" aria-hidden /> Local
            </>
          )}
        </Badge>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-3" aria-label="Change password">
          <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
          <Field id="pw-current" label="Current password" error={errors.current?.message}>
            <Input type="password" autoComplete="current-password" {...register('current')} {...fieldAria('pw-current', errors.current?.message)} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="pw-next" label="New password" error={errors.next?.message}>
              <Input type="password" autoComplete="new-password" {...register('next')} {...fieldAria('pw-next', errors.next?.message)} />
            </Field>
            <Field id="pw-confirm" label="Confirm new password" error={errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...register('confirm')} {...fieldAria('pw-confirm', errors.confirm?.message)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={isSubmitting}>
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DataCard() {
  const { bets, transactions, settings, importBackup } = useData();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<BackupPayload | null>(null);
  const [mode, setMode] = React.useState<'merge' | 'replace'>('merge');
  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportJson = () => {
    const backup: BackupFile = { app: 'edgetrack', version: 1, exportedAt: new Date().toISOString(), settings, bets, transactions };
    downloadFile(`edgetrack-backup-${stamp()}.json`, JSON.stringify(backup, null, 2), 'application/json');
    toast.success('Backup downloaded', { description: `${bets.length} bets · ${transactions.length} transactions` });
  };

  const onFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Backup file is too large (max 20 MB).');
      return;
    }
    try {
      const parsed = backupSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        toast.error('Not a valid EdgeTrack backup', { description: `${issue.path.join('.') || 'file'}: ${issue.message}` });
        return;
      }
      setMode('merge');
      setPending(parsed.data);
    } catch {
      toast.error('Could not read file', { description: 'Make sure it is a JSON backup exported from EdgeTrack.' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" aria-hidden /> Export & backup
          </CardTitle>
          <CardDescription>
            {bets.length} bets · {transactions.length} bankroll transactions
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            disabled={!bets.length}
            onClick={() => {
              downloadFile(`edgetrack-bets-${stamp()}.csv`, betsToCsv(bets), 'text/csv;charset=utf-8');
              toast.success(`Exported ${bets.length} bets to CSV`);
            }}
          >
            <Download /> Bets as CSV
          </Button>
          <Button variant="secondary" onClick={exportJson}>
            <FileJson /> Full backup (JSON)
          </Button>
        </div>
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
          <Upload /> Restore from backup…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
        <p className="text-xs text-subtle-foreground">
          The backup contains bets, bankroll transactions and preferences — never your password.
        </p>
      </CardContent>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Restore backup?"
        destructive={mode === 'replace'}
        confirmLabel={mode === 'replace' ? 'Replace all data' : 'Merge backup'}
        description={
          <span className="block space-y-3">
            <span className="block">
              Backup from {pending ? new Date(pending.exportedAt).toLocaleString() : ''} with {pending?.bets.length} bets and{' '}
              {pending?.transactions.length} transactions.
            </span>
            <Segmented
              label="Restore mode"
              className="w-full"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: 'Merge' },
                { value: 'replace', label: 'Replace all' },
              ]}
            />
            <span className="block text-xs">
              {mode === 'merge'
                ? 'Records with the same ID are updated; everything else is kept.'
                : 'All current bets and transactions are deleted first. This cannot be undone.'}
            </span>
          </span>
        }
        onConfirm={async () => {
          if (!pending) return;
          try {
            const r = await importBackup(pending, mode);
            toast.success('Backup restored', { description: `${r.bets} bets · ${r.transactions} transactions` });
            setPending(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Restore failed');
            throw e;
          }
        }}
      />
    </Card>
  );
}
