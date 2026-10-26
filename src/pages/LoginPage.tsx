import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Eye, EyeOff, HardDrive, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { APP_TAGLINE } from '@/lib/constants';
import { loginSchema, setupSchema, type LoginValues, type SetupValues } from '@/lib/validation';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Field, Input, fieldAria } from '@/components/ui/input';

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { inputRef?: React.Ref<HTMLInputElement> }) {
  const [show, setShow] = React.useState(false);
  const { inputRef, ...rest } = props;
  return (
    <div className="relative">
      <Input ref={inputRef} type={show ? 'text' : 'password'} className="pr-11" {...rest} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { status, service } = useAuth();
  const setupMode = status === 'needsSetup';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <p className="mt-3 text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-card backdrop-blur">
          {setupMode ? <SetupForm /> : <SignInForm />}
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-subtle-foreground">
          {service.mode === 'supabase' ? (
            <>
              <ShieldCheck className="size-3.5" aria-hidden /> Secured by Supabase Auth · private account
            </>
          ) : (
            <>
              <HardDrive className="size-3.5" aria-hidden /> Local mode — data stays in this browser
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function SignInForm() {
  const { signIn } = useAuth();
  const [error, setError] = React.useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { username: '', password: '' } });

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(undefined);
    try {
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    }
  });

  const { ref: pwRef, ...pwReg } = register('password');

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Sign in">
      <div>
        <h1 className="text-lg font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your private dashboard.</p>
      </div>
      <Field id="username" label="Username" error={errors.username?.message}>
        <Input {...register('username')} {...fieldAria('username', errors.username?.message)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        <PasswordInput {...pwReg} inputRef={pwRef} {...fieldAria('password', errors.password?.message)} autoComplete="current-password" />
      </Field>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-loss">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        {!isSubmitting && <Lock />} Sign in
      </Button>
    </form>
  );
}

function SetupForm() {
  const { setup } = useAuth();
  const [error, setError] = React.useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupValues>({ resolver: zodResolver(setupSchema), defaultValues: { username: '', password: '', confirm: '' } });

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(undefined);
    try {
      await setup(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
    }
  });

  const pw = register('password');
  const cf = register('confirm');

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Create account">
      <div>
        <h1 className="text-lg font-semibold">Set up your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          First run on this device. Choose the username and password you'll use to unlock EdgeTrack.
        </p>
      </div>
      <Field id="setup-username" label="Username" error={errors.username?.message}>
        <Input {...register('username')} {...fieldAria('setup-username', errors.username?.message)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
      </Field>
      <Field id="setup-password" label="Password" error={errors.password?.message}>
        <PasswordInput {...pw} inputRef={pw.ref} {...fieldAria('setup-password', errors.password?.message)} autoComplete="new-password" />
      </Field>
      <Field id="setup-confirm" label="Confirm password" error={errors.confirm?.message}>
        <PasswordInput {...cf} inputRef={cf.ref} {...fieldAria('setup-confirm', errors.confirm?.message)} autoComplete="new-password" />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Create account
      </Button>
      <p className="text-xs leading-relaxed text-subtle-foreground">
        Only a salted PBKDF2 hash of your password is stored. For cloud sync and server-side security, configure Supabase
        (see README).
      </p>
    </form>
  );
}
