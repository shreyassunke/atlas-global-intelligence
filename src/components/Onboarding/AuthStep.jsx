import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../services/supabase'
import { useAtlasStore } from '../../store/atlasStore'

export default function AuthStep() {
  const setUser = useAtlasStore((s) => s.setUser)
  const setOnboardingStep = useAtlasStore((s) => s.setOnboardingStep)

  const [mode, setMode] = useState('idle') // 'idle' | 'signin' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const proceed = (user) => {
    if (user) setUser(user)
    setOnboardingStep('sources')
  }

  const handleGoogle = async () => {
    if (!supabase) {
      proceed(null)
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (err) setError(err.message)
    setLoading(false)
  }

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    if (!supabase) {
      proceed(null)
      return
    }
    setLoading(true)
    setError(null)

    if (mode === 'register') {
      const { data, error: err } = await supabase.auth.signUp({ email, password })
      if (err) {
        setError(err.message)
      } else if (data?.user?.identities?.length === 0) {
        setError('An account with this email already exists.')
      } else {
        setConfirmationSent(true)
      }
    } else {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) {
        setError(err.message)
      } else {
        proceed(data.user)
      }
    }
    setLoading(false)
  }

  if (confirmationSent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 max-w-sm"
        >
          <div className="text-[var(--accent)] text-xl">✓</div>
          <p className="text-[10px] tracking-[0.35em] text-white/60 uppercase font-mono leading-relaxed">
            Confirmation email sent to <span className="text-white/80">{email}</span>.
            Check your inbox and sign in.
          </p>
          <button
            onClick={() => { setConfirmationSent(false); setMode('signin') }}
            className="mt-2 text-[9px] tracking-[0.4em] text-[var(--accent)]/60 hover:text-[var(--accent)] uppercase font-mono transition-colors"
          >
            Back to sign in
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center gap-5 w-full max-w-xs"
      >
        {/* Google OAuth */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 min-h-[44px]
                     bg-transparent border border-white/10 hover:border-white/20
                     font-mono text-[10px] tracking-[0.3em] text-white/60 hover:text-white/80
                     uppercase transition-all disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[8px] tracking-[0.4em] text-white/20 uppercase font-mono">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Email / Password form */}
        <form onSubmit={handleEmailAuth} className="w-full flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full bg-transparent border-b border-white/10 focus:border-[var(--accent)]/40
                       py-2.5 text-[10px] tracking-[0.2em] text-white/70 placeholder:text-white/20
                       font-mono outline-none transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full bg-transparent border-b border-white/10 focus:border-[var(--accent)]/40
                       py-2.5 text-[10px] tracking-[0.2em] text-white/70 placeholder:text-white/20
                       font-mono outline-none transition-colors"
          />

          {error && (
            <p className="text-[9px] tracking-[0.15em] text-red-400/80 font-mono text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            onClick={() => { if (mode === 'idle') setMode('signin') }}
            className="w-full py-3 min-h-[44px] bg-transparent border border-[var(--accent)]/20
                       hover:border-[var(--accent)]/40 text-[var(--accent)]/70 hover:text-[var(--accent)]
                       font-mono text-[10px] tracking-[0.4em] uppercase transition-all
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? '...' : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Toggle sign-in / register */}
        <button
          type="button"
          onClick={() => {
            setError(null)
            setMode(mode === 'register' ? 'signin' : 'register')
          }}
          className="text-[8px] tracking-[0.35em] text-white/25 hover:text-white/40 font-mono uppercase transition-colors"
        >
          {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create account'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full mt-1">
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Guest skip */}
        <button
          type="button"
          onClick={() => proceed(null)}
          className="text-[9px] tracking-[0.3em] text-white/20 hover:text-white/40
                     font-mono uppercase transition-colors"
        >
          Continue without account
        </button>
      </motion.div>
    </div>
  )
}
